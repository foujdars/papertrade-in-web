import Image from "next/image";

export function BrandMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`brand-logo-pair ${className}`.trim()} style={{ width: size, height: size }} aria-hidden="true">
      <Image src="/papertrade-mark-light-v118.png" alt="" width={size} height={size} className="brand-logo-image brand-logo-light" priority unoptimized />
      <Image src="/papertrade-mark-dark-v118.png" alt="" width={size} height={size} className="brand-logo-image brand-logo-dark" priority unoptimized />
    </span>
  );
}
