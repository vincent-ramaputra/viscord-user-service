export interface Payload<T> {
  recipients: string[];
  targetIds: string[];
  data: T;
}
