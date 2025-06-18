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

const BATCH_SIZE = 5;

export default function AskAI() {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'question' | 'estimate'>('question');
  const [userChoice, setUserChoice] = useState<string | null>(null);

  const [batch, setBatch] = useState<TrolleyBatchItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const fetchingBatch = useRef(false);

  const fetchBatch = async () => {
    if (fetchingBatch.current) return;
    fetchingBatch.current = true;
    setLoading(true);
    setError(null);
    setUserChoice(null);
    setPhase('question');

    const batchPrompt = `
Create ${BATCH_SIZE} absurd trolley problems, each in exactly two sentences: one starting with 'If nothing is done,' and one with 'If the lever is pulled.' Each should be under 40 words total. For each, estimate the percentage of people who would agree with "Press the lever" and "Do nothing" (just a number and a % for each, no explanation). Respond as a JSON array of objects, each with "question" and "estimates" fields, where "estimates" is an object with keys "Press the lever" and "Do nothing". Example:
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
        setBatch([]);
        setCurrentIndex(0);
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
        setBatch(parsed);
        setCurrentIndex(0);
      } else {
        setError("Could not parse trolley problems. Please try again.");
        setBatch([]);
        setCurrentIndex(0);
      }
    } catch {
      setError("Error fetching trolley problems.");
      setBatch([]);
      setCurrentIndex(0);
    } finally {
      setLoading(false);
      fetchingBatch.current = false;
    }
  };

  useEffect(() => {
    fetchBatch();
  }, []);

  const handleChoice = (choice: string) => {
    setUserChoice(choice);
    setPhase('estimate');
  };

  const handleNext = () => {
    setUserChoice(null);
    setPhase('question');
    if (currentIndex + 1 < batch.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      fetchBatch();
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center text-3xl">
        <div>Generating more trolley problems...</div>
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  const current = batch[currentIndex] || null;

  if (!current) {
    return (
      <div className="flex justify-center items-center text-3xl">
        <div>No trolley problems available.</div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center text-3xl">
      <div className="mb-6 w-full">
        <div>
          <div className="p-4 rounded mb-4">
            <p>{current.question}</p>
          </div>
          {!userChoice && (
            <div className="flex gap-4 justify-center mb-6">
              <button
                className="border-2 p-2 rounded-md hover:bg-black hover:text-white cursor-pointer"
                onClick={() => handleChoice('Press the lever')}
                disabled={!!userChoice}
              >
                Press the lever
              </button>
              <button
                className="border-2 p-2 rounded-md hover:bg-black hover:text-white cursor-pointer"
                onClick={() => handleChoice('Do nothing')}
                disabled={!!userChoice}
              >
                Do nothing
              </button>
            </div>
          )}
        </div>
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
    </div>
  );
}
