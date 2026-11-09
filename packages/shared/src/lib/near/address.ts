/**
 * A NEAR account in the places the trade UI expects an address object. The UI
 * only ever reads it back as text, so `toBase58` simply returns the account.
 */
export class NearAddress {
  constructor(readonly value: string) {}

  toBase58(): string {
    return this.value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: NearAddress | null | undefined): boolean {
    return other?.value === this.value;
  }
}
