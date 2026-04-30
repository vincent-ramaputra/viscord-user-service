export interface Result<T> {
  status: number;
  message: string;
  data: T | null;
}
