import AskAI from "./component/askai";

export default function Home() {
  return (
    <div className="w-[60%] h-full mx-auto">
      <h1 className="text-6xl text-center p-16">Absurd AI Trolley Problems</h1>
      <img src="/rails.png" alt="Rails" className="w-full mx-auto" />
      <AskAI />
    </div>
  );
}
