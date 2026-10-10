# Demo checklist

The demo currently uses five stills, not video. CAM01.png through CAM05.png in data/images/ are the inputs. Each still is one real_clip event. The judge page is http://127.0.0.1:5173/demo: five cards, each still next to the voted plate, confidence, format_valid, source, camera, timestamp, and raw reads from GET /api/events.

## Before you open the page

1. Backend: `cd backend` then `uvicorn main:app --reload --port 8000`
2. OCR and POST: `cd ml` then `python run_images.py`
3. Frontend: `cd frontend` then `npm run dev`
4. Open http://127.0.0.1:5173/demo
