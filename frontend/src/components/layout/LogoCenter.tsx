interface LogoCenterProps {
  logoSrc: string;
}

export default function LogoCenter({ logoSrc }: LogoCenterProps) {
  return (
    <div className="flex justify-center items-center my-10">
      <div className="w-36 h-36 flex items-center justify-center rounded-full bg-white shadow-md">
        <img
          src={logoSrc}
          alt="NutriMentor AI Logo"
          className="w-24 h-24 object-contain"
        />
      </div>
    </div>
  );
}
