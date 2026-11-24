(function () {
  'use strict';

  function initHero3D() {
    const container = document.getElementById('hero3dStage');
    const fallbackImg = document.getElementById('heroImage');
    if (!container || typeof window.THREE === 'undefined') return;

    const THREE = window.THREE;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (_) {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    if (fallbackImg) fallbackImg.style.display = 'none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.25, 8.6);

    // Studio Lighting (warm metallic industrial mood matching 3D emblem)
    const ambient = new THREE.AmbientLight(0xfff1e4, 0.9);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfff6ed, 2.3);
    keyLight.position.set(5, 6, 7);
    scene.add(keyLight);

    const orangeRim = new THREE.PointLight(0xff6a16, 4.5, 18);
    orangeRim.position.set(-2.5, -1.6, 3.5);
    scene.add(orangeRim);

    const fillLight = new THREE.DirectionalLight(0xd9c7b8, 1.1);
    fillLight.position.set(-6, 3, -4);
    scene.add(fillLight);

    // Materials
    const brushedMetal = new THREE.MeshStandardMaterial({
      color: 0xd8d2cc,
      metalness: 0.88,
      roughness: 0.24
    });

    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x2b2420,
      metalness: 0.82,
      roughness: 0.3
    });

    const accentOrange = new THREE.MeshStandardMaterial({
      color: 0xf25c05,
      emissive: 0x5c1c00,
      emissiveIntensity: 0.55,
      metalness: 0.42,
      roughness: 0.22
    });

    // Root logo group
    const logoGroup = new THREE.Group();
    scene.add(logoGroup);

    // 1. Three horizontal metallic bars on the left
    const barGeo = new THREE.BoxGeometry(1.55, 0.22, 0.28);
    [-0.45, 0, 0.45].forEach((y) => {
      const bar = new THREE.Mesh(barGeo, brushedMetal);
      bar.position.set(-1.95, y - 0.1, 0);
      logoGroup.add(bar);
    });

    // 2. Central tall metallic spire + glowing orange angled tip
    const spireBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.3, 0.34), brushedMetal);
    spireBody.position.set(-0.65, -0.05, 0);
    logoGroup.add(spireBody);

    const spireCore = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.1, 0.37), darkMetal);
    spireCore.position.set(-0.65, -0.08, 0);
    logoGroup.add(spireCore);

    const tipShape = new THREE.Shape();
    tipShape.moveTo(-0.16, 0);
    tipShape.lineTo(0.16, 0);
    tipShape.lineTo(-0.16, 0.82);
    tipShape.closePath();
    const tipGeo = new THREE.ExtrudeGeometry(tipShape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 2
    });
    tipGeo.center();
    const spireTip = new THREE.Mesh(tipGeo, accentOrange);
    spireTip.position.set(-0.65, 1.98, 0);
    logoGroup.add(spireTip);

    // 3. Multi-layered 3D spiral rings around the spire base (unwind/wind on scroll!)
    const spiralGroup = new THREE.Group();
    spiralGroup.position.set(-0.65, -0.95, 0);
    spiralGroup.rotation.x = 1.24;
    spiralGroup.rotation.z = -0.18;
    logoGroup.add(spiralGroup);

    function createHelixTube(radiusStart, radiusEnd, turns, heightSpan, tubeRadius, phaseOffset, mat) {
      const points = [];
      const steps = 110;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = t * Math.PI * 2 * turns + phaseOffset;
        const r = radiusStart + (radiusEnd - radiusStart) * t;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        const z = (t - 0.5) * heightSpan;
        points.push(new THREE.Vector3(x, y, z));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const geo = new THREE.TubeGeometry(curve, 120, tubeRadius, 14, false);
      return new THREE.Mesh(geo, mat);
    }

    const outerOrangeSpiral = createHelixTube(0.55, 1.52, 1.65, 0.42, 0.085, 0, accentOrange);
    const midMetalSpiral = createHelixTube(0.45, 1.32, 1.7, 0.36, 0.07, Math.PI * 0.65, brushedMetal);
    const innerDarkSpiral = createHelixTube(0.38, 1.05, 1.45, 0.3, 0.055, Math.PI * 1.3, darkMetal);

    spiralGroup.add(outerOrangeSpiral, midMetalSpiral, innerDarkSpiral);

    // 4. 3D Extruded "ICT" monogram on the right side
    const ictGroup = new THREE.Group();
    ictGroup.position.set(0.35, 0.32, 0.05);
    logoGroup.add(ictGroup);

    // Letter I
    const letterI = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.25, 0.28), brushedMetal);
    letterI.position.set(0, 0, 0);
    ictGroup.add(letterI);

    // Letter C (partial torus arc)
    const cGeo = new THREE.TorusGeometry(0.54, 0.145, 14, 36, Math.PI * 1.48);
    const letterC = new THREE.Mesh(cGeo, brushedMetal);
    letterC.position.set(0.95, 0, 0);
    letterC.rotation.z = Math.PI * 0.26;
    ictGroup.add(letterC);

    // Letter T
    const tTop = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.24, 0.28), brushedMetal);
    tTop.position.set(2.05, 0.5, 0);
    const tStem = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.15, 0.28), brushedMetal);
    tStem.position.set(2.05, -0.05, 0);
    ictGroup.add(tTop, tStem);

    // Center the whole composition cleanly inside viewport
    logoGroup.position.set(-0.22, 0.12, 0);

    // Responsive sizing so it always fits within container bounds
    function resize() {
      const rect = container.getBoundingClientRect();
      const w = Math.max(220, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height));
      camera.aspect = w / h;
      // Fit logo comfortably regardless of aspect ratio
      const scaleFactor = w < 380 ? 0.78 : w < 520 ? 0.88 : 0.96;
      logoGroup.scale.setScalar(scaleFactor);
      camera.position.z = w / h < 1.15 ? 9.6 : 8.4;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    resize();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(container);
    } else {
      window.addEventListener('resize', resize);
    }

    // Scroll-driven spiral wind/unwind + pointer interactive tilt
    let targetScrollAngle = 0;
    let currentScrollAngle = 0;
    let targetExpand = 1;
    let currentExpand = 1;
    let pointerX = 0;
    let pointerY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;

    function updateScrollTargets() {
      const y = window.scrollY || 0;
      // Positive scroll down unwinds; scroll up winds back
      targetScrollAngle = y * 0.011;
      const progress = Math.min(1, y / 600);
      targetExpand = 1 + progress * 0.24;
    }

    window.addEventListener('scroll', updateScrollTargets, { passive: true });
    updateScrollTargets();

    container.addEventListener('pointermove', (e) => {
      const rect = container.getBoundingClientRect();
      pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    });
    container.addEventListener('pointerleave', () => {
      pointerX = 0;
      pointerY = 0;
    });

    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      currentScrollAngle += (targetScrollAngle - currentScrollAngle) * 0.08;
      currentExpand += (targetExpand - currentExpand) * 0.08;
      currentTiltX += (pointerY * 0.22 - currentTiltX) * 0.07;
      currentTiltY += (pointerX * 0.32 - currentTiltY) * 0.07;

      // Spirals wind / unwind with scroll + gentle idle rotation
      outerOrangeSpiral.rotation.z = -currentScrollAngle + t * 0.22;
      midMetalSpiral.rotation.z = -currentScrollAngle * 1.25 - t * 0.16;
      innerDarkSpiral.rotation.z = -currentScrollAngle * 1.55 + t * 0.12;

      // Unwind radial expansion on scroll
      spiralGroup.scale.set(currentExpand, currentExpand, 1 + (currentExpand - 1) * 1.3);

      // Subtle interactive 3D tilt + floating motion
      logoGroup.rotation.y = currentTiltY + Math.sin(t * 0.65) * 0.08 + Math.sin(currentScrollAngle * 0.35) * 0.12;
      logoGroup.rotation.x = currentTiltX + Math.cos(t * 0.55) * 0.04;
      logoGroup.position.y = 0.12 + Math.sin(t * 1.1) * 0.06;

      renderer.render(scene, camera);
    }

    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHero3D);
  } else {
    initHero3D();
  }
})();
