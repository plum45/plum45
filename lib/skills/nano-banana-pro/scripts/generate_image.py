#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-genai>=1.0.0",
#     "pillow>=10.0.0",
# ]
# ///
import argparse
import os
import sys
from pathlib import Path

def get_api_key(provided_key: str | None) -> str | None:
    if provided_key: return provided_key
    return os.environ.get("GEMINI_API_KEY")

def main():
    parser = argparse.ArgumentParser(description="Generate images using Nano Banana Pro (Gemini 3 Pro Image)")
    parser.add_argument("--prompt", "-p", required=True, help="Image description/prompt")
    parser.add_argument("--filename", "-f", required=True, help="Output filename")
    parser.add_argument("--input-image", "-i", help="Optional input image path for editing")
    parser.add_argument("--resolution", "-r", choices=["1K", "2K", "4K"], default="1K")
    parser.add_argument("--api-key", "-k", help="Gemini API key")

    args = parser.parse_args()
    api_key = get_api_key(args.api_key)
    
    if not api_key:
        print("Error: No API key provided.", file=sys.stderr)
        sys.exit(1)

    try:
        from google import genai
        from google.genai import types
        from PIL import Image as PILImage
    except ImportError:
        print("Error: Required libraries not found. Run with 'uv run'.", file=sys.stderr)
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    output_path = Path(args.filename)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    input_image = None
    if args.input_image:
        input_image = PILImage.open(args.input_image)
    
    contents = [input_image, args.prompt] if input_image else args.prompt

    try:
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(image_size=args.resolution)
            )
        )

        for part in response.parts:
            if part.inline_data:
                from io import BytesIO
                image = PILImage.open(BytesIO(part.inline_data.data))
                image.convert('RGB').save(str(output_path), 'PNG')
                print(f"\nImage saved: {output_path.resolve()}")
                return
        print("Error: No image generated.", file=sys.stderr)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
