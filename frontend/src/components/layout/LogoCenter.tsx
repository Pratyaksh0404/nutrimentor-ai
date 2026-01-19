interface LogoCenterProps {
  logoSrc: string;
}

export default function LogoCenter({ logoSrc }: LogoCenterProps) {
  return (
    <div className="flex justify-center my-1">
      <img
      src={logoSrc}
      alt="NutriMentor AI"
      className="w-40 h-40"
    />
    </div>

  );
}
