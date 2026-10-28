import { AdminCard } from '@kart-republique/ui';

const BIG = { fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--gold)', lineHeight: 1 } as const;
const LABEL = { fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-body)' } as const;

/** One figure with its caption: a card the dashboard's and Compte's statistics are laid out in. */
export function Figure({ value, label, id }: { value: number | string; label: string; id?: string }) {
  return (
    <AdminCard id={id} style={{ textAlign: 'center' }}>
      <div style={BIG}>{value}</div>
      <div style={LABEL}>{label}</div>
    </AdminCard>
  );
}
