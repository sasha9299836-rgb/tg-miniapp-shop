import "./product-thumb.css";

type ProductThumbProps = {
  src?: string;
  alt?: string;
  mediaType?: "image" | "video";
  variant?: "card" | "square" | "fluid";
  loading?: "eager" | "lazy";
  decoding?: "sync" | "async" | "auto";
  controls?: boolean;
  poster?: string;
  preload?: "none" | "metadata" | "auto";
  playsInline?: boolean;
  muted?: boolean;
  className?: string;
  mediaClassName?: string;
};

export function ProductThumb({
  src,
  alt = "",
  mediaType = "image",
  variant = "fluid",
  loading = "lazy",
  decoding = "async",
  controls = false,
  poster,
  preload = "metadata",
  playsInline = true,
  muted = false,
  className = "",
  mediaClassName = "",
}: ProductThumbProps) {
  return (
    <div className={`product-thumb product-thumb--${variant} ${className}`.trim()}>
      {src && mediaType === "video" ? (
        <video
          className={`product-thumb__media ${mediaClassName}`.trim()}
          src={src}
          controls={controls}
          poster={poster}
          preload={preload}
          playsInline={playsInline}
          muted={muted}
        />
      ) : null}
      {src && mediaType === "image" ? (
        <img
          className={`product-thumb__media ${mediaClassName}`.trim()}
          src={src}
          alt={alt}
          loading={loading}
          decoding={decoding}
        />
      ) : null}
    </div>
  );
}

export default ProductThumb;
