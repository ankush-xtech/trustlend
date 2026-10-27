import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepPersonal } from "@/components/wizard/step-personal";
import { DEFAULT_PRODUCT_CONFIG } from "@/lib/domain/product-config";
import type { WizardState } from "@/components/wizard/types";

function makeState(): WizardState {
  return {
    application: { id: "app-1", reference: "TL-HL-TEST0001", status: "DRAFT", version: 1, currentStep: 1, completedSteps: [], applicantType: null, acquisitionSource: "DIRECT", createdByAgent: false },
    product: { id: "p", name: "Home Loan", currency: "INR", minAmount: "500000.00", maxAmount: "5000000.00", config: DEFAULT_PRODUCT_CONFIG, isIllustrative: false },
    documentRequirements: [],
    prefill: { fullName: "Asha Verma", email: "asha@example.com", mobile: "9876543210" },
    inputs: { step1: null, step2: null, step3: null, step4: null },
    documents: [],
    editable: true,
  } as unknown as WizardState;
}

describe("<StepPersonal />", () => {
  it("shows client-side validation errors and does not call save for invalid data", async () => {
    const save = vi.fn();
    render(<StepPersonal state={makeState()} version={1} disabled={false} save={save} />);
    await userEvent.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText(/enter a valid date/i)).toBeInTheDocument();
    expect(screen.getByText(/select an identity document type/i)).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("prefills profile data and submits normalised values", async () => {
    const save = vi.fn().mockResolvedValue({ ok: true });
    render(<StepPersonal state={makeState()} version={1} disabled={false} save={save} />);
    expect(screen.getByLabelText(/full legal name/i)).toHaveValue("Asha Verma");
    await userEvent.type(screen.getByLabelText(/date of birth/i), "1990-05-01");
    await userEvent.selectOptions(screen.getByLabelText(/identity document/i), "PAN card");
    await userEvent.type(screen.getByLabelText(/last 4 characters/i), "ab12");
    await userEvent.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe(1);
    expect(save.mock.calls[0][1]).toMatchObject({ fullName: "Asha Verma", identityNumberLast4: "AB12", identityDocumentType: "PAN card" });
  });

  it("maps server field errors onto the form", async () => {
    const save = vi.fn().mockResolvedValue({ ok: false, fieldErrors: { mobile: ["This mobile number is not accepted"] } });
    render(<StepPersonal state={makeState()} version={1} disabled={false} save={save} />);
    await userEvent.type(screen.getByLabelText(/date of birth/i), "1990-05-01");
    await userEvent.selectOptions(screen.getByLabelText(/identity document/i), "PAN card");
    await userEvent.type(screen.getByLabelText(/last 4 characters/i), "ab12");
    await userEvent.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText("This mobile number is not accepted")).toBeInTheDocument();
  });
});
