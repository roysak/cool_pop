# Cool Pop

Cool Pop is a 6×6 water-balloon reflex game for the browser and YouTube Playables. Pop the cool balloons, let red balloons float by, and build your score before your three lives run out. Enable Hard mode in the pause menu to also lose a life when you miss a cool balloon.

The page is in `index.html`, base styles are in `main.css`, the gameplay and modal theme is in `splash.css`, the illustrated home screen layout is in `home.css`, and game logic is in `main.js`. Gameplay balloons are drawn in CSS; water splashes, droplets, and ripples use canvas. Audio is synthesized with the Web Audio API.

The home screen uses `assets/home-scene.webp` with a separate, keyboard-accessible Start button. The artwork fills standard portrait phones, cropping only the decorative edges. Other aspect ratios keep the entire composition visible with a blurred extension filling the surrounding space. It is a compressed WebP of artwork generated with the built-in imagegen tool using the supplied reference.

Artwork prompt: Reproduce the reference's glossy 3D rainbow “COOL POP” logo, floating water-filled balloons, blue sky, tropical foliage, waterfall, and sparkling turquoise pool in a 9:16 portrait composition. Remove the orange Start button and replace that area with unobstructed water so an interactive HTML button can be overlaid. No other text or UI.

## Run locally

Serve this directory with a local web server, then open `index.html`. For example:

```shell
python -m http.server 9000
```

Open `http://localhost:9000/` in a browser. The game runs without the YouTube Playables SDK when played locally.
