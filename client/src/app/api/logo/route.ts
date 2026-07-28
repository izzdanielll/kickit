import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOGO_SOURCE = `C:\\Users\\User\\.gemini\\antigravity-ide\\brain\\64acee54-a1d6-41d0-a7b9-813fd4af880a\\media__1784856380555.jpg`;
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const DEST_PATH = path.join(PUBLIC_DIR, 'logo.jpg');

export async function GET() {
  try {
    if (fs.existsSync(LOGO_SOURCE)) {
      if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
      }
      try {
        fs.copyFileSync(LOGO_SOURCE, DEST_PATH);
      } catch (err) {
        console.warn('Could not copy logo to public folder, serving directly:', err);
      }
      const imageBuffer = fs.readFileSync(LOGO_SOURCE);
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } else if (fs.existsSync(DEST_PATH)) {
      const imageBuffer = fs.readFileSync(DEST_PATH);
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
    return new NextResponse('Logo image not found', { status: 404 });
  } catch (error) {
    console.error('Error serving logo:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
