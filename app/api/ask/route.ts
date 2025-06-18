// app/api/ask/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    const model = genAI.getGenerativeModel({ model: 'models/gemini-2.0-flash-lite' });

    const result = await model.generateContent(question);
    const response = result.response;
    const text = response.text();

    return NextResponse.json({ answer: text });
  } catch (err) {
    console.error('Gemini error:', err);
    return NextResponse.json({ error: 'Failed to get a response from Gemini.' }, { status: 500 });
  }
}
