export function Logo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  return (
    <div className="select-none leading-none" aria-label="ANIME STRIKERS">
      <div className={`logo-text ${size === 'lg' ? 'text-5xl sm:text-7xl' : 'text-xl'} font-black tracking-tight`}>ANIME</div>
      <div className={`font-display italic text-white ${size === 'lg' ? 'text-3xl sm:text-5xl -mt-1' : 'text-base -mt-0.5'} font-black tracking-[0.18em]`}>
        STRIKERS<span className="text-gold">⚡</span>
      </div>
    </div>
  );
}
