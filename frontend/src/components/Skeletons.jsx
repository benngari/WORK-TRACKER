const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5'];

export function Bar({ className = '' }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

function Wrap({ children, className = '' }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Loading...</span>
      {children}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }) {
  return (
    <Wrap>
      <div className="card p-0 overflow-hidden">
        <div className="flex gap-4 px-4 py-3 border-b border-slate-100">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="flex-1">
              <Bar className="h-3 w-1/2" />
            </div>
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5 border-b border-slate-50 last:border-0">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="flex-1">
                <Bar className={`h-4 ${WIDTHS[(r + c) % WIDTHS.length]}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Wrap>
  );
}

export function RowsSkeleton({ rows = 3 }) {
  return (
    <Wrap className="space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <Bar key={r} className={`h-4 ${WIDTHS[r % WIDTHS.length]}`} />
      ))}
    </Wrap>
  );
}

function StatCardSkeleton() {
  return (
    <div className="card">
      <Bar className="h-3 w-1/2 mb-3" />
      <Bar className="h-7 w-2/3" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Wrap className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card">
            <Bar className="h-4 w-1/3 mb-4" />
            <Bar className="h-48 w-full" />
          </div>
        ))}
      </div>
    </Wrap>
  );
}

export function DetailSkeleton() {
  return (
    <Wrap className="space-y-4">
      <div className="card space-y-4">
        <Bar className="h-6 w-1/2" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Bar className="h-3 w-1/3 mb-2" />
              <Bar className="h-6 w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-6 border-b border-slate-100 pb-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-4 w-20" />
        ))}
      </div>
      <div className="card space-y-3">
        <Bar className="h-4 w-1/3" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
        <Bar className="h-4 w-2/3" />
      </div>
    </Wrap>
  );
}

export function FormSkeleton() {
  return (
    <Wrap>
      <div className="card space-y-5 max-w-xl">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Bar className="h-3 w-1/4 mb-2" />
            <Bar className="h-10 w-full" />
          </div>
        ))}
        <Bar className="h-9 w-28" />
      </div>
    </Wrap>
  );
}