import os
import re
from flask import Flask, render_template, request, jsonify


import mimetypes
mimetypes.add_type('application/wasm', '.wasm')

app = Flask(__name__)


@app.after_request
def _allow_cors(resp):
    # Allow the Course Planner (served from another localhost port) to call
    # /api/transcript from the browser. Simple GET, so a permissive header is enough.
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


# Matches the 11-char video id in the common YouTube URL shapes.
_YT_ID_RE = re.compile(r'(?:v=|/shorts/|/live/|/embed/|youtu\.be/)([A-Za-z0-9_-]{11})')


def _extract_video_id(url):
    if not url:
        return None
    url = url.strip()
    m = _YT_ID_RE.search(url)
    if m:
        return m.group(1)
    # Allow a bare 11-char id to be passed directly.
    if re.fullmatch(r'[A-Za-z0-9_-]{11}', url):
        return url
    return None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/transcript')
def transcript():
    """Background transcription service: returns the caption text for a YouTube
    video so the browser can fold it into the AI prompt. Runs server-side, so it
    avoids the CORS restrictions that block fetching captions from the page, and
    never sees the user's Gemini key."""
    raw = request.args.get('url', '') or request.args.get('v', '')
    video_id = _extract_video_id(raw)
    if not video_id:
        return jsonify({'error': 'Could not parse a YouTube video id from the URL.'}), 400

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            NoTranscriptFound, CouldNotRetrieveTranscript,
        )
    except ImportError:
        return jsonify({
            'error': 'Transcript library not installed. Run: pip install -r requirements.txt'
        }), 500

    try:
        api = YouTubeTranscriptApi()
        tlist = api.list(video_id)

        # Prefer an English track (manual or auto); otherwise take the first
        # available and translate it to English when possible.
        try:
            transcript = tlist.find_transcript(['en', 'en-US', 'en-GB'])
        except NoTranscriptFound:
            transcript = next(iter(tlist), None)
        if transcript is None:
            return jsonify({'error': 'No captions/transcript available for this video.'}), 404

        if not transcript.language_code.startswith('en') and getattr(transcript, 'is_translatable', False):
            try:
                transcript = transcript.translate('en')
            except Exception:
                pass

        fetched = transcript.fetch()
        rows = fetched.to_raw_data() if hasattr(fetched, 'to_raw_data') else [
            {'text': getattr(s, 'text', '')} for s in fetched
        ]
        text = ' '.join(r['text'].strip() for r in rows if r.get('text'))
        text = re.sub(r'\s+', ' ', text).strip()
        if not text:
            return jsonify({'error': 'The transcript was empty.'}), 404

        return jsonify({'transcript': text, 'videoId': video_id})

    except CouldNotRetrieveTranscript as e:
        # Map the library's specific failure types to short, friendly messages.
        friendly = {
            'TranscriptsDisabled': 'Captions are disabled for this video.',
            'NoTranscriptFound': 'No captions/transcript available for this video.',
            'VideoUnavailable': 'The video is unavailable or private.',
            'VideoUnplayable': 'The video cannot be played (region or age restricted).',
            'AgeRestricted': 'The video is age-restricted, so its transcript cannot be fetched.',
            'RequestBlocked': 'YouTube is temporarily blocking transcript requests from this network. Try again later.',
            'IpBlocked': 'YouTube is blocking transcript requests from this IP. Try again later.',
            'PoTokenRequired': 'YouTube now requires extra verification to fetch this transcript.',
        }.get(type(e).__name__, 'Could not retrieve a transcript for this video.')
        return jsonify({'error': friendly}), 404
    except Exception as e:
        return jsonify({'error': 'Failed to fetch transcript: ' + str(e)}), 502


if __name__ == '__main__':
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    app.run(debug=debug_mode, port=5500)
