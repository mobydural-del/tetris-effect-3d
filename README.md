# ⚡ TETRIS EFFECT: SYNESTHESIA JOURNEY 3D

> **Hi-Fi Rush & Persona 5 Neobrutalist Pop-Art Comic Edition**  
> Un viaje sinestésico tridimensional que fusiona la jugabilidad oficial de Tetris Guideline, música electrónica reactiva, parada temporal (*Zone Mode*) y escenarios 3D dinámicos en tiempo real con Three.js.

🎮 **[Jugar Ahora en GitHub Pages](https://mobydural-del.github.io/tetris-effect-3d/)**

---

## 🌟 Características Principales

### 1. Fases Sensoriales y Música Reactiva (Suno AI)
* **Fase 1: Abismo Bioluminiscente (110 BPM · D Dorian)**: Fondo marino procedural esculpido en 3D con dunas, corales de Turing, mantarrayas gigantes, ballenas jorobadas, medusas de alta geometría con brazos orales ondulantes y cardumen de peces que nadan atravesando el primer plano por delante del tablero.
* **Fase 2: Metrópolis Cyberpunk Synthwave (128 BPM · A Minor)**: 24 rascacielos modulares con texturas PBR procedurales de ventanas y hologramas, autopista elevada con estelas de luz, spinners voladores con propulsores vectoriales y monolitos subwoofer mecha reactivos al ritmo.
* **Fase 3: Nebulosa Cósmica Trascendental (138 BPM · F# Lydian)**: Los 8 planetas del Sistema Solar (Júpiter con la Gran Mancha Roja, Saturno con anillos concéntricos y lunas, Tierra con nubes y atmósfera Fresnel, Marte, Urano, Neptuno, Venus y Mercurio) orbitando con geometría ultra-suave y relieve Sobel, junto a un agujero negro central con lente gravitacional y asteroides que cruzan por delante del jugador.

### 2. Motor Tetris Guideline Completo
* **Super Rotation System (SRS)** con tablas completas de wall kicks para todos los tetrominós.
* **Modo Zona (Detención Temporal)**: Activable al acumular 25%+ de energía. Congela la gravedad, permitiendo acumular hasta 16+ líneas para desatar una supernova de puntuación.
* **Juez de Sincronía Rítmica (Beat-Sync Judge)**: Detecta giros y caídas sincronizadas con el pulso musical para otorgar multiplicadores de puntuación.
* **Fantasmas y Guías Holográficas 3D**: Proyección exacta de caída calculada sin desalineación visual.

### 3. Jugabilidad Móvil en Modo Vertical (Portrait) y Controles Táctiles
* **HUD Superior Compacto (~45px)**: Puntuación, Nivel, Líneas y pulsos de compás en una franja superior que deja más del **85% de la pantalla 100% libre y visible**.
* **Mini-Pods Táctiles**: Cajas de `HOLD` y `SIGUIENTE` en las esquinas superiores.
* **Gestos Táctiles Directos en Pantalla**:
  * **Arrastre horizontal**: Desplaza la pieza lateralmente con precisión por columnas.
  * **Tap simple**: Rota en sentido horario (CW).
  * **Tap con dos dedos**: Rota en sentido antihorario (CCW).
  * **Arrastre suave abajo**: Caída suave (*Soft Drop*).
  * **Flick rápido abajo**: Caída dura instantánea (*Hard Drop*).
  * **Swipe arriba (o toque en caja HOLD)**: Reserva la pieza en Hold.
* **Botón Flotante para el Pulgar (`⚡ ZONA`)**: Ergonómico en la esquina inferior derecha, pulsante cuando está listo para activar.
* **Respuesta Háptica (`navigator.vibrate`)**: Vibraciones táctiles en movimientos, giros, drops y limpiezas de líneas.

---

## 🕹️ Controles de Teclado (Escritorio)

| Acción | Teclas |
| :--- | :--- |
| **Mover Lateralmente** | <kbd>←</kbd> / <kbd>→</kbd> |
| **Giro Horario (CW)** | <kbd>↑</kbd> / <kbd>X</kbd> / <kbd>W</kbd> |
| **Giro Antihorario (CCW)** | <kbd>Control</kbd> / <kbd>Z</kbd> / <kbd>Q</kbd> |
| **Caída Suave (Soft Drop)** | <kbd>↓</kbd> |
| **Caída Rápida (Hard Drop)**| <kbd>Espacio</kbd> |
| **Reserva (Hold)** | <kbd>C</kbd> / <kbd>Shift</kbd> |
| **Activar Modo Zona** | <kbd>Z</kbd> (con $\ge 25\%$ energía) |
| **Pausar Juego** | <kbd>P</kbd> / <kbd>Escape</kbd> |

---

## 🚀 Despliegue en Local

Para ejecutar el juego en tu ordenador local:

```bash
# Iniciar servidor local Python
python3 server.py
# Abrir en el navegador
# http://localhost:8095
```

---

## 🛠️ Tecnologías Utilizadas
* **Three.js r128**: Renderizado WebGL 3D en tiempo real con PBR, iluminación dinámica de tres puntos, shaders GLSL y mapas de normales Sobel procedurales generados en Canvas 2D.
* **Web Audio API**: Motor de síntesis procedural con osciladores polifónicos, filtros paso bajo modulados y sincronización con pistas maestras en MP3.
* **HTML5 Canvas 2D**: Previsualizaciones de Hold/Next queue y texturas procedurales.
* **CSS3 Neobrutalism**: Estilo cómic pop inspirado en *Persona 5* y *Hi-Fi Rush*.
