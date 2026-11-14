# Prism Tap

Prism Tap is a 6×6 water-balloon reflex game for the browser and YouTube Playables. Pop the cool balloons, let red balloons float by, and build your score before your three lives run out. Hard mode also costs a life when you miss a cool balloon.

The page is in `index.html`, base styles are in `main.css`, the poolside theme and shared balloon artwork are in `splash.css`, and game logic is in `main.js`. The balloons are drawn in CSS; water splashes, droplets, and ripples use canvas. No additional image downloads are needed. `tap.html` is the original, unchanged single-file version.

## Run locally

Serve this directory with a local web server, then open `index.html`. For example:

```shell
python -m http.server 9000
```

Open `http://localhost:9000/` in a browser. The game runs without the YouTube Playables SDK when played locally.
