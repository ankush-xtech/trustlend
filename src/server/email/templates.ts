/**
 * Plain-text transactional email templates. Emails contain links into the app rather than
 * sensitive details; customers sign in to see application information.
 */
export interface RenderedEmail {
  subject: string;
  text: string;
}

const footer = `\n\n—\nTrustLend\nThis is an automated message. If you did not expect it, you can ignore it or contact support.`;

export const templates = {
  emailVerification: (p: { name: string; url: string }): RenderedEmail => ({
    subject: "Verify your TrustLend email address",
    text: `Hello ${p.name},\n\nPlease confirm your email address by opening the link below (valid for 24 hours):\n\n${p.url}${footer}`,
  }),
  accountExists: (p: { url: string }): RenderedEmail => ({
    subject: "TrustLend registration attempt",
    text: `Someone tried to create a TrustLend account with this email address, but an account already exists.\n\nIf this was you, sign in or reset your password here:\n\n${p.url}${footer}`,
  }),
  passwordReset: (p: { name: string; url: string }): RenderedEmail => ({
    subject: "Reset your TrustLend password",
    text: `Hello ${p.name},\n\nWe received a request to reset your password. Open the link below within 30 minutes to choose a new password. The link can be used once.\n\n${p.url}\n\nIf you did not request this, no action is needed.${footer}`,
  }),
  passwordChanged: (p: { name: string }): RenderedEmail => ({
    subject: "Your TrustLend password was changed",
    text: `Hello ${p.name},\n\nYour password was changed and other sessions were signed out. If this was not you, reset your password immediately and contact support.${footer}`,
  }),
  invitation: (p: { name: string; url: string; roleName: string; invitedBy: string }): RenderedEmail => ({
    subject: "You have been invited to TrustLend",
    text: `Hello ${p.name},\n\n${p.invitedBy} has invited you to TrustLend as ${p.roleName}. Set your password using the link below (valid for 72 hours):\n\n${p.url}${footer}`,
  }),
  applicationSubmitted: (p: { name: string; reference: string; url: string }): RenderedEmail => ({
    subject: `Application ${p.reference} received`,
    text: `Hello ${p.name},\n\nWe have received your loan application ${p.reference}. Our team will review your documents. Submission does not guarantee approval.\n\nTrack your application: ${p.url}${footer}`,
  }),
  applicationAssigned: (p: { name: string; reference: string; url: string }): RenderedEmail => ({
    subject: `Application ${p.reference} assigned to you`,
    text: `Hello ${p.name},\n\nApplication ${p.reference} has been assigned to you for review.\n\n${p.url}${footer}`,
  }),
  informationRequested: (p: { name: string; reference: string; url: string }): RenderedEmail => ({
    subject: `Action needed on application ${p.reference}`,
    text: `Hello ${p.name},\n\nWe need some additional information or documents for application ${p.reference}. Please sign in to see the request and respond.\n\n${p.url}${footer}`,
  }),
  documentRejected: (p: { name: string; reference: string; url: string }): RenderedEmail => ({
    subject: `A document needs to be re-uploaded (${p.reference})`,
    text: `Hello ${p.name},\n\nOne of the documents on application ${p.reference} could not be accepted. Please sign in to see the reason and upload a replacement.\n\n${p.url}${footer}`,
  }),
  documentsAccepted: (p: { name: string; reference: string; url: string }): RenderedEmail => ({
    subject: `Documents accepted for ${p.reference}`,
    text: `Hello ${p.name},\n\nThe documents on application ${p.reference} have been reviewed and accepted. Your application moves to the next review stage. This is not a loan approval.\n\n${p.url}${footer}`,
  }),
  statusChanged: (p: { name: string; reference: string; statusLabel: string; url: string }): RenderedEmail => ({
    subject: `Update on application ${p.reference}`,
    text: `Hello ${p.name},\n\nYour application ${p.reference} is now: ${p.statusLabel}.\n\nSign in for details: ${p.url}${footer}`,
  }),
  decisionRecorded: (p: { name: string; reference: string; statusLabel: string; url: string }): RenderedEmail => ({
    subject: `Decision recorded on application ${p.reference}`,
    text: `Hello ${p.name},\n\nA decision has been recorded on application ${p.reference}: ${p.statusLabel}.\n\nSign in for details: ${p.url}${footer}`,
  }),
  disbursementRecorded: (p: { name: string; reference: string; url: string }): RenderedEmail => ({
    subject: `Disbursement recorded for ${p.reference}`,
    text: `Hello ${p.name},\n\nThe lender's confirmed disbursement for application ${p.reference} has been recorded.\n\n${p.url}${footer}`,
  }),
  commissionApproved: (p: { name: string; reference: string; amount: string; url: string }): RenderedEmail => ({
    subject: `Commission approved for ${p.reference}`,
    text: `Hello ${p.name},\n\nYour commission of ${p.amount} for application ${p.reference} has been approved for payment.\n\n${p.url}${footer}`,
  }),
  commissionPaid: (p: { name: string; reference: string; amount: string; paymentReference: string; url: string }): RenderedEmail => ({
    subject: `Commission payment recorded for ${p.reference}`,
    text: `Hello ${p.name},\n\nA payment of ${p.amount} (reference ${p.paymentReference}) has been recorded for your commission on application ${p.reference}.\n\n${p.url}${footer}`,
  }),
};
