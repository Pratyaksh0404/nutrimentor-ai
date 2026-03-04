interface LogoCenterProps {
  logoSrc: string;
}

export default function LogoCenter({ logoSrc }: LogoCenterProps) {
  return (
    <div className="flex justify-center my-1">
      <img
      src={logoSrc}
      alt="NutriMentor AI"
      className="w-60 h-60 object-contain drop-shadow-xl"
    />
    </div>

  );
}
