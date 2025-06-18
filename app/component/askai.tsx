'use client';

import { useState, useEffect, useRef } from 'react';

function extractPercent(estimate: string) {
  const match = estimate.match(/(\d{1,3})%/);
  return match ? parseInt(match[1], 10) : null;
}

type TrolleyBatchItem = {
  question: string;
  estimates: {
    "Press the lever": string;
    "Do nothing": string;
  };
};

function parseBatchResponse(text: string): TrolleyBatchItem[] {
  try {
    const arr: unknown = JSON.parse(text);
    if (
      Array.isArray(arr) &&
      arr.every(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { question: unknown }).question === "string" &&
          typeof (item as { estimates: unknown }).estimates === "object" &&
          (item as { estimates: { "Press the lever": unknown } }).estimates !== null &&
          typeof (item as { estimates: { "Press the lever": unknown } }).estimates["Press the lever"] === "string" &&
          typeof (item as { estimates: { "Do nothing": unknown } }).estimates["Do nothing"] === "string"
      )
    ) {
      return arr as TrolleyBatchItem[];
    }
  } catch {
    // Intentionally empty to suppress unused variable warning
  }

  const objects: TrolleyBatchItem[] = [];
  try {
    const arrMatch = text.match(/\[([\s\S]*?)\]/);
    if (arrMatch) {
      const arrText = arrMatch[0];
      const arr: unknown = JSON.parse(arrText.replace(/,\s*]/g, "]"));
      if (Array.isArray(arr)) {
        for (const obj of arr) {
          if (
            typeof obj === "object" &&
            obj !== null &&
            typeof (obj as { question: unknown }).question === "string" &&
            typeof (obj as { estimates: unknown }).estimates === "object" &&
            (obj as { estimates: { "Press the lever": unknown } }).estimates !== null &&
            typeof (obj as { estimates: { "Press the lever": unknown } }).estimates["Press the lever"] === "string" &&
            typeof (obj as { estimates: { "Do nothing": unknown } }).estimates["Do nothing"] === "string"
          ) {
            objects.push(obj as TrolleyBatchItem);
          }
        }
        if (objects.length > 0) return objects;
      }
    }
  } catch {
    // Intentionally empty to suppress unused variable warning
  }

  const regex = /{[\s\S]*?}/g;
  const matches = text.match(regex);
  if (matches) {
    for (const m of matches) {
      try {
        const obj: unknown = JSON.parse(m);
        if (
          typeof obj === "object" &&
          obj !== null &&
          typeof (obj as { question: unknown }).question === "string" &&
          typeof (obj as { estimates: unknown }).estimates === "object" &&
          (obj as { estimates: { "Press the lever": unknown } }).estimates !== null &&
          typeof (obj as { estimates: { "Press the lever": unknown } }).estimates["Press the lever"] === "string" &&
          typeof (obj as { estimates: { "Do nothing": unknown } }).estimates["Do nothing"] === "string"
        ) {
          objects.push(obj as TrolleyBatchItem);
        }
      } catch {
        // Intentionally empty to suppress unused variable warning
      }
    }
    if (objects.length > 0) return objects;
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    if (lines[i].toLowerCase().startsWith("question:")) {
      const question = lines[i].slice(9).trim();
      const estimates: { "Press the lever"?: string; "Do nothing"?: string } = {};
      i++;
      while (i < lines.length && lines[i].toLowerCase().startsWith("estimates:")) {
        const estLine = lines[i].slice(10).trim();
        const pressMatch = estLine.match(/Press the lever: ?(\d{1,3}%)/i);
        const doNothingMatch = estLine.match(/Do nothing: ?(\d{1,3}%)/i);
        if (pressMatch) estimates["Press the lever"] = pressMatch[1];
        if (doNothingMatch) estimates["Do nothing"] = doNothingMatch[1];
        i++;
      }
      if (question && estimates["Press the lever"] && estimates["Do nothing"]) {
        objects.push({ question, estimates: { "Press the lever": estimates["Press the lever"]!, "Do nothing": estimates["Do nothing"]! } });
      }
    } else {
      i++;
    }
  }
  return objects;
}

// Set the batch size to 10 to cache 10 questions at a time
const BATCH_SIZE = 10;

// List of adjectives to diversify the prompt
const ADJECTIVES = [
  "funny",
  "interesting",
  "thought-provoking",
  "absurd",
  "challenging",
  "philosophical",
  "weird",
  "creative",
  "surprising",
  "controversial"
];

function getRandomAdjectives(count: number) {
  // Shuffle and pick 'count' adjectives
  const shuffled = [...ADJECTIVES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Typing animation hook
function useTypewriter(text: string, speed: number, deps: unknown[] = []) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    setDisplayed('');
    if (!text) return;
    let i = 0;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      setDisplayed(text.slice(0, i + 1));
      if (i < text.length - 1) {
        i++;
        setTimeout(tick, speed);
      }
    }
    tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, ...deps]);
  return displayed;
}

export default function AskAI() {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'question' | 'estimate'>('question');
  const [userChoice, setUserChoice] = useState<string | null>(null);

  // Maintain a queue of questions to cache 10 at a time
  const [batch, setBatch] = useState<TrolleyBatchItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const fetchingBatch = useRef(false);

  // For animation: track when question is fully shown
  const [questionDone, setQuestionDone] = useState(false);

  // Track adjectives used for the current batch
  const [currentAdjectives, setCurrentAdjectives] = useState<string[]>([]);

  // For image hover/selection state
  const [hoveredButton, setHoveredButton] = useState<null | 'Do nothing' | 'Press the lever'>(null);

  // Fetch a batch of 10 questions and append to the queue
  const fetchBatch = async () => {
    if (fetchingBatch.current) return;
    fetchingBatch.current = true;
    setLoading(true);
    setError(null);
    setUserChoice(null);
    setPhase('question');
    setQuestionDone(false);

    // Pick 3 random adjectives for each request
    const adjectivesArr = getRandomAdjectives(3);
    setCurrentAdjectives(adjectivesArr);
    const adjectives = adjectivesArr.join(", ");

    const batchPrompt = `
Create ${BATCH_SIZE} ${adjectives} trolley problems, each in exactly two sentences: one starting with 'If nothing is done,' and one with 'If the lever is pulled.' Each should be under 40 words total. For each, estimate the percentage of people who would agree with "Press the lever" and "Do nothing" (just a number and a % for each, no explanation). Respond as a JSON array of objects, each with "question" and "estimates" fields, where "estimates" is an object with keys "Press the lever" and "Do nothing". Example:
[
  {
    "question": "If nothing is done, ... If the lever is pulled, ...",
    "estimates": {
      "Press the lever": "67%",
      "Do nothing": "33%"
    }
  }
]
No extra commentary.
    `.trim();

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: batchPrompt }),
      });

      if (!res.ok) {
        setError("Failed to fetch trolley problems.");
        setLoading(false);
        fetchingBatch.current = false;
        return;
      }

      const data: unknown = await res.json();
      let parsed: TrolleyBatchItem[] = [];
      if (
        typeof data === "object" &&
        data !== null &&
        "answer" in data &&
        typeof (data as { answer: unknown }).answer === "string"
      ) {
        parsed = parseBatchResponse((data as { answer: string }).answer);
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        setBatch(prev => {
          // If we already have some questions left, append new ones
          // Remove already used questions (currentIndex) before appending
          const remaining = prev.slice(currentIndex);
          setCurrentIndex(0);
          return [...remaining, ...parsed];
        });
      } else {
        setError("Could not parse trolley problems. Please try again.");
      }
    } catch {
      setError("Error fetching trolley problems.");
    } finally {
      setLoading(false);
      fetchingBatch.current = false;
    }
  };

  // On mount, fetch the first batch
  useEffect(() => {
    fetchBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = batch[currentIndex] || null;

  // Typing animation for question
  const typewriterSpeed = 18; // ms per character
  const displayedQuestion = useTypewriter(
    current && phase === 'question' ? current.question : '',
    typewriterSpeed,
    [currentIndex, phase]
  );

  // When question changes, reset questionDone
  useEffect(() => {
    setQuestionDone(false);
  }, [currentIndex, phase]);

  // When typing animation finishes, set questionDone
  useEffect(() => {
    if (
      current &&
      phase === 'question' &&
      displayedQuestion.length === current.question.length
    ) {
      setQuestionDone(true);
    }
  }, [displayedQuestion, current, phase]);

  const handleChoice = (choice: string) => {
    setUserChoice(choice);
    setPhase('estimate');
    setHoveredButton(null); // Remove hover state on selection
    // questionDone remains true so question stays visible
  };

  const handleNext = () => {
    setUserChoice(null);
    setPhase('question');
    setQuestionDone(false);
    setHoveredButton(null);
    // If we are at the last question in the current batch, fetch more
    if (currentIndex + 1 < batch.length) {
      setCurrentIndex(currentIndex + 1);
      // If we are about to run out (e.g., only 2 left), prefetch next batch
      if (batch.length - (currentIndex + 2) < 2 && !fetchingBatch.current) {
        fetchBatch();
      }
    } else {
      // If no more questions, fetch a new batch and reset
      fetchBatch();
    }
  };

  // Determine which image to show based on hover and selection
  let railsImg = "/rails.png";
  if (phase === "question" && !userChoice) {
    if (hoveredButton === "Press the lever") {
      railsImg = "/rails_pressed.png";
    } else if (hoveredButton === "Do nothing") {
      railsImg = "/rails_nothing.png";
    }
  } else if (phase === "estimate" && userChoice) {
    if (userChoice === "Press the lever") {
      railsImg = "/rails_pressed.png";
    } else if (userChoice === "Do nothing") {
      railsImg = "/rails_nothing.png";
    }
  }

  // Always show the question (with animation if in question phase, full text if in estimate phase)
  const showFullQuestion = phase === 'estimate' && current ? current.question : displayedQuestion;
  const showCursor =
    phase === 'question' &&
    displayedQuestion.length < (current?.question?.length || 0);

  return (
    <div className="flex justify-center items-center text-3xl flex-col">
      {/* Always show the image, even if loading or error */}
      <img src={railsImg} alt="Rails" className="w-full h-full select-none"/>
      <div className="mb-6 w-full">
        <div className="mb-2 text-base text-gray-500 items-center gap-2 hidden">
          <span className="font-semibold">Adjectives for this batch:</span>
          {currentAdjectives.length > 0 ? (
            <span>
              {currentAdjectives.map((adj, idx) => (
                <span key={adj}>
                  {adj}
                  {idx < currentAdjectives.length - 1 ? ', ' : ''}
                </span>
              ))}
            </span>
          ) : (
            <span>Loading...</span>
          )}
        </div>
        {/* Loading state */}
        {loading && batch.length === 0 ? (
          <div className="flex justify-center items-center text-3xl">
            <div>Generating more trolley problems...</div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center text-3xl">
            <div>
              <div className="text-red-600 mb-4">{error}</div>
              <button
                className="border-2 p-2 rounded-md hover:bg-black hover:text-white cursor-pointer"
                onClick={fetchBatch}
              >
                Try Again
              </button>
            </div>
          </div>
        ) : !current ? (
          <div className="flex justify-center items-center text-3xl">
            <div>No trolley problems available.</div>
          </div>
        ) : (
          <div>
            <div className="p-4 rounded mb-4 min-h-[3.5em]">
              <p
                style={{
                  fontFamily: 'inherit',
                  whiteSpace: 'pre-line',
                  minHeight: '2.5em',
                  letterSpacing: '0.01em',
                  transition: 'color 0.2s',
                  color: showCursor ? '#888' : undefined
                }}
                aria-label={current.question}
              >
                {showFullQuestion}
                <span
                  style={{
                    display: showCursor ? 'inline-block' : 'none',
                    width: '0.6ch',
                    background: 'currentColor',
                    opacity: 0.5,
                    animation: 'blink 1s steps(1) infinite'
                  }}
                >
                  &nbsp;
                </span>
              </p>
              <style>{`
                @keyframes blink {
                  0% { opacity: 0.5; }
                  50% { opacity: 0; }
                  100% { opacity: 0.5; }
                }
              `}</style>
            </div>
            {!userChoice && (
              <div className="flex gap-4 justify-center mb-6">
                {questionDone && (
                  <>
                    <button
                      className="border-2 p-2 rounded-md hover:bg-black hover:text-white cursor-pointer"
                      onClick={() => handleChoice('Do nothing')}
                      disabled={!!userChoice}
                      onMouseEnter={() => setHoveredButton('Do nothing')}
                      onMouseLeave={() => setHoveredButton(null)}
                    >
                      Do nothing
                    </button>
                    <button
                      className="border-2 p-2 rounded-md hover:bg-black hover:text-white cursor-pointer"
                      onClick={() => handleChoice('Press the lever')}
                      disabled={!!userChoice}
                      onMouseEnter={() => setHoveredButton('Press the lever')}
                      onMouseLeave={() => setHoveredButton(null)}
                    >
                      Press the lever
                    </button>
                  </>
                )}
              </div>
            )}
            {phase === 'estimate' && userChoice && (
              <div className='absolute bottom-0 w-[60%] mx-auto flex justify-center border-t-2 p-8 gap-16 items-center'>
                <div className="">
                  <div>
                    {(() => {
                      const estimate = current.estimates[userChoice as "Press the lever" | "Do nothing"];
                      const percent = extractPercent(estimate);
                      if (percent !== null) {
                        const disagree = 100 - percent;
                        return (
                          <div className="text-2xl my-2">
                            AI says <span className="bg-green-200 text-green-900 px-2 py-1 rounded">{percent}% of people agree with you</span> ,while <span className="bg-red-200 text-red-900 px-2 py-1 rounded">{disagree}% disagree</span>
                          </div>
                        );
                      } else {
                        return (
                          <div className="text-2xl font-extrabold my-2">{estimate}</div>
                        );
                      }
                    })()}
                  </div>
                </div>
                <button
                  className="border-2 p-2 rounded-md hover:bg-black hover:text-white cursor-pointer"
                  onClick={handleNext}
                >
                  Next Question
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
