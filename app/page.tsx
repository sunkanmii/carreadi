import Analyzer from "@/components/Analyzer";
import CheckedCounter from "@/components/CheckedCounter";
import WelcomeBack from "@/components/WelcomeBack";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 sm:py-16">
      <div className="w-full max-w-xl text-center">
        <p className="mb-3 inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">Your AI career partner</p>
        <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Your next job isn&rsquo;t a guessing game.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-muted text-pretty">
          Upload your CV. See what employers want, what you already have, what you&rsquo;re missing, and exactly what to do next.
        </p>
        <CheckedCounter />
      </div>
      <WelcomeBack />
      <Analyzer />
    </div>
  );
}
