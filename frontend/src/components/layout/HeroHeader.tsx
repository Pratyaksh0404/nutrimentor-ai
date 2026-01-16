export default function HeroHeader() {
  return (
    <div className="text-center mb-10">
      <h1
        className="text-4xl md:text-5xl font-extrabold tracking-wide"
        style={{ fontFamily: "Georgia, serif" }}
      >
        NUTRIMENTOR AI
      </h1>

      <p className="mt-2 text-gray-600 italic text-lg">
        “Consume exactly what suites you!”
      </p>
    </div>
  );
}
