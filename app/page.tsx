import Analyzer from "@/components/Analyzer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-10 sm:py-16">
      <div className="w-full max-w-xl text-center">
        <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
          Your next job isn&rsquo;t a guessing game.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[15px] text-muted text-pretty">
          See what employers want, what you&rsquo;re missing, and what to do next.
        </p>
      </div>
      <Analyzer />
    </div>
  );
}
