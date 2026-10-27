import "server-only";
import net from "node:net";
import { env } from "@/server/config/env";
import { logger } from "@/server/logger";

export type ScanResult = "CLEAN" | "INFECTED" | "NOT_SCANNED" | "ERROR";

export interface MalwareScanner {
  readonly name: string;
  scan(bytes: Buffer): Promise<ScanResult>;
}

/** No scanner configured: files are marked NOT_SCANNED and reviewers see a warning. */
class NoopScanner implements MalwareScanner {
  readonly name = "none";
  async scan(): Promise<ScanResult> {
    return "NOT_SCANNED";
  }
}

/**
 * Development stand-in: detects the EICAR antivirus test signature only. It is NOT malware protection
 * and is refused in production by the environment validator.
 */
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
class SignatureScanner implements MalwareScanner {
  readonly name = "signature (dev)";
  async scan(bytes: Buffer): Promise<ScanResult> {
    return bytes.includes(Buffer.from(EICAR, "latin1")) ? "INFECTED" : "CLEAN";
  }
}

/** ClamAV daemon (clamd) using the INSTREAM protocol over TCP. */
class ClamAvScanner implements MalwareScanner {
  readonly name = "clamav";
  async scan(bytes: Buffer): Promise<ScanResult> {
    const { CLAMAV_HOST, CLAMAV_PORT } = env();
    if (!CLAMAV_HOST) return "ERROR";
    return new Promise<ScanResult>((resolve) => {
      const socket = net.createConnection({ host: CLAMAV_HOST, port: CLAMAV_PORT ?? 3310 });
      let response = "";
      const done = (r: ScanResult) => {
        socket.destroy();
        resolve(r);
      };
      socket.setTimeout(15_000, () => done("ERROR"));
      socket.on("error", (err) => {
        logger.warn("clamav scan failed", { error: err.message });
        done("ERROR");
      });
      socket.on("data", (d) => (response += d.toString()));
      socket.on("end", () => done(/OK\0?$/.test(response.trim()) ? "CLEAN" : /FOUND/.test(response) ? "INFECTED" : "ERROR"));
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        const chunkSize = 64 * 1024;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length);
          socket.write(len);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}

let scanner: MalwareScanner | null = null;
export function getScanner(): MalwareScanner {
  if (!scanner) {
    const kind = env().MALWARE_SCANNER;
    scanner = kind === "clamav" ? new ClamAvScanner() : kind === "signature" ? new SignatureScanner() : new NoopScanner();
  }
  return scanner;
}
