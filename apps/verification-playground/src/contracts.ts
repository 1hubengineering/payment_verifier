import type {
  AmountCheck,
  ProviderId,
  SerializedVerificationOperationError,
  VerificationResult,
  VerificationCheck,
} from '@1hubengineering/verifier';
import type { AttemptTiming } from '@1hubengineering/verification-benchmarks/performance';
import type { MockCase } from './presets.ts';

export type Mode = 'simulated' | 'live';
export type InputProvider = ProviderId | 'auto';
export interface AllowanceForm {
  unit: 'fixed' | 'percentage';
  value: string;
}
export interface Draft {
  provider: ProviderId;
  amount: string;
  recipientName: string;
  recipientAccountLast4: string;
  reference: string;
  referenceRequired?: boolean | undefined;
  validFrom: string;
  validUntil: string;
  tolerance: boolean;
  under: AllowanceForm;
  over: AllowanceForm;
}
export interface SavedDraft {
  id: string;
  name: string;
  draft: Draft;
}
export interface Submission {
  mode: Mode;
  paymentId: string;
  attemptId: string;
  evidence: string;
  inputProvider: InputProvider;
  mockCase: MockCase;
  showLiveValues?: boolean | undefined;
}
export interface Report {
  mode: Mode;
  paymentId: string;
  attemptId: string;
  provider: ProviderId;
  startedAt: string;
  result: VerificationResult | SerializedVerificationOperationError;
  timing: AttemptTiming;
  timeoutMs: number;
  transientChecks?: readonly VerificationCheck[];
}
export interface HistoryItem {
  mode: Mode;
  paymentId: string;
  attemptId: string;
  provider: ProviderId;
  startedAt: string;
  mockCase: MockCase;
  inputProvider: InputProvider;
  report: Report | null;
}
export interface SessionInfo {
  mustChangePassword: boolean;
  liveProviders: ProviderId[];
  retentionDays: number;
  timeoutMs: number;
}
export type Bounds = Pick<AmountCheck['details'], 'minimumAcceptedMinor' | 'maximumAcceptedMinor'>;
