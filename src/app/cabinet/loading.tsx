export default function ChargementCabinet() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 rounded bg-gray-200" />
      <div className="h-28 rounded-xl bg-gray-200" />
      <div className="h-28 rounded-xl bg-gray-200" />
      <div className="h-64 rounded-xl bg-gray-200" />
    </div>
  );
}
