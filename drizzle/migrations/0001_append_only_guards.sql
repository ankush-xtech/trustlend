-- Append-only guards for audit, workflow history and financial ledger tables.
-- Normal application operations can only INSERT into these tables. Retention purges, if ever
-- legally required, must be performed by a DBA through a reviewed, documented procedure.

CREATE OR REPLACE FUNCTION trustlend_prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only (% blocked)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER application_status_history_append_only BEFORE UPDATE OR DELETE ON application_status_history
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER document_reviews_append_only BEFORE UPDATE OR DELETE ON document_reviews
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER lender_decisions_append_only BEFORE UPDATE OR DELETE ON lender_decisions
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER disbursements_append_only BEFORE UPDATE OR DELETE ON disbursements
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER commission_adjustments_append_only BEFORE UPDATE OR DELETE ON commission_adjustments
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_mutation();
--> statement-breakpoint
CREATE TRIGGER commission_payments_append_only BEFORE UPDATE OR DELETE ON commission_payments
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_mutation();
--> statement-breakpoint
-- Financial and application records are retained; they are closed/cancelled, never deleted.
CREATE OR REPLACE FUNCTION trustlend_prevent_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Rows in % must be retained (DELETE blocked)', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER loan_applications_no_delete BEFORE DELETE ON loan_applications
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_delete();
--> statement-breakpoint
CREATE TRIGGER commission_records_no_delete BEFORE DELETE ON commission_records
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_delete();
--> statement-breakpoint
CREATE TRIGGER application_documents_no_delete BEFORE DELETE ON application_documents
  FOR EACH ROW EXECUTE FUNCTION trustlend_prevent_delete();
--> statement-breakpoint
-- Commission records may only be created for agent-referred applications.
CREATE OR REPLACE FUNCTION trustlend_commission_requires_referral() RETURNS trigger AS $$
DECLARE
  src acquisition_source;
  agent uuid;
BEGIN
  SELECT acquisition_source, referring_agent_id INTO src, agent FROM loan_applications WHERE id = NEW.application_id;
  IF src IS DISTINCT FROM 'AGENT_REFERRAL' OR agent IS DISTINCT FROM NEW.agent_id THEN
    RAISE EXCEPTION 'Commission requires an agent-referred application attributed to the same agent'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commission_records_referral_check BEFORE INSERT OR UPDATE OF application_id, agent_id ON commission_records
  FOR EACH ROW EXECUTE FUNCTION trustlend_commission_requires_referral();
