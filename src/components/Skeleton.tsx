export function SkeletonBox({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-xl ${className}`} />;
}

export function SkeletonKpi() {
  return (
    <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-2.5 w-24 bg-white/10 rounded" />
        <div className="h-8 w-8 bg-white/10 rounded-xl" />
      </div>
      <div className="h-8 w-28 bg-white/10 rounded mb-2" />
      <div className="h-2.5 w-16 bg-white/5 rounded" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0 animate-pulse">
      <div className="h-8 w-8 bg-white/10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 bg-white/10 rounded" />
        <div className="h-2 w-20 bg-white/5 rounded" />
      </div>
      <div className="h-5 w-16 bg-white/10 rounded" />
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-4 pb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-[#0F172A] border border-white/5 rounded-3xl p-6 animate-pulse">
          <div className="h-3 w-32 bg-white/10 rounded mb-5" />
          <div className="flex items-end gap-2 h-32 mb-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex-1 bg-white/10 rounded-t" style={{ height: `${20 + Math.random() * 80}%` }} />
            ))}
          </div>
        </div>
        <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-6 animate-pulse">
          <div className="h-3 w-28 bg-white/10 rounded mb-5" />
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-[#0F172A] border border-white/5 rounded-3xl p-6 animate-pulse">
            <div className="h-3 w-28 bg-white/10 rounded mb-5" />
            {Array.from({ length: 4 }).map((_, j) => <SkeletonRow key={j} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="space-y-4 pb-10 animate-pulse">
      <div className="h-8 w-48 bg-white/10 rounded-xl mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonKpi key={i} />)}
      </div>
      <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-6">
        <div className="h-3 w-32 bg-white/10 rounded mb-5" />
        {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    </div>
  );
}
