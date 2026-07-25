// A dimmed, pixelated-blurred backdrop shared by the full-screen paper views
// (letter writing + letter wall). The source is rendered small then scaled up
// with crisp (pixelated) sampling for a chunky mosaic, so the room stays
// recognizable but recedes behind the paper in focus. Accepts either a still
// image or an .mp4 (rendered as a muted, looping video with the same look).

export default function PixelBlurBg({
  src,
  brightness = 0.5,
}: {
  src: string;
  brightness?: number;
}) {
  const isVideo = /\.mp4(\?|$)/i.test(src);
  const mediaStyle: React.CSSProperties = {
    ...imgStyle,
    filter: `brightness(${brightness}) saturate(0.8) blur(0.5px)`,
  };

  return (
    <div aria-hidden style={clipStyle}>
      {isVideo ? (
        <video src={src} autoPlay muted loop playsInline style={mediaStyle} />
      ) : (
        <img src={src} alt="" style={mediaStyle} />
      )}
      <div style={vignetteStyle} />
    </div>
  );
}

const clipStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  zIndex: 0,
};

// 1/6 size then scaled 6x with pixelated sampling → mosaic blur.
const imgStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "16.67%",
  height: "16.67%",
  objectFit: "cover",
  transformOrigin: "top left",
  transform: "scale(6)",
  imageRendering: "pixelated",
};

const vignetteStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(ellipse at center, rgba(10,6,2,0.1) 0%, rgba(10,6,2,0.46) 100%)",
};
