import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
}

export default function Container({ children }: ContainerProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#fde8e8]">
      {children}
    </div>
  );
}
