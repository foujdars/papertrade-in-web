import Image from "next/image";

export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/papertrade-mark-v117.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`brand-logo-image ${className}`.trim()}
      priority
      unoptimized
    />
  );
}
