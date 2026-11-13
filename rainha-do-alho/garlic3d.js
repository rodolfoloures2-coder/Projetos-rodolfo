(function () {
  var THREE, GLTFLoader;
  var libs = null;
  function loadLibs() {
    if (!libs) {
      libs = Promise.all([
        import('https://esm.sh/three@0.160.0'),
        import('https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js')
      ]).then(function (mods) {
        THREE = mods[0];
        GLTFLoader = mods[1].GLTFLoader;
      });
    }
    return libs;
  }

  class Garlic3D extends HTMLElement {
    connectedCallback() {
      if (this._started) return;
      this._started = true;
      var self = this;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.style.height = '100%';
      loadLibs().then(function () { self._init(); }).catch(function (e) {
        console.error('garlic-3d: three.js failed to load', e);
        var logo = (window.__resources && window.__resources['img-logo']) || 'assets/logo.png';
        self.innerHTML = '<img src="' + logo + '" alt="Rainha do Alho Gourmet" style="width:80%;height:80%;object-fit:contain;display:block;margin:10% auto;" />';
      });
    }

    _init() {
      var src = (window.__resources && window.__resources['garlic-glb']) || this.getAttribute('src') || 'assets/garlic.glb';
      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';
      this.appendChild(renderer.domElement);

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0, 0.3, 6.2);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.HemisphereLight(0xfff0cf, 0x1a1206, 1.1));
      var key = new THREE.DirectionalLight(0xfff2d0, 2.8);
      key.position.set(2.4, 3.2, 3);
      scene.add(key);
      var rim = new THREE.DirectionalLight(0xe8c87a, 2.4);
      rim.position.set(-3, 1.2, -2.5);
      scene.add(rim);
      var fill = new THREE.PointLight(0xf7e3ae, 10, 14);
      fill.position.set(0, -1.5, 2.5);
      scene.add(fill);

      var pivot = new THREE.Group();
      scene.add(pivot);

      new GLTFLoader().load(src, function (gltf) {
        var model = gltf.scene;
        var box = new THREE.Box3().setFromObject(model);
        var size = box.getSize(new THREE.Vector3());
        var center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.scale.setScalar(2.4 / Math.max(size.x, size.y, size.z));
        pivot.add(model);
      }, undefined, function (err) { console.error('garlic-3d: model failed', err); });

      var el = this;
      el._scene = scene; el._camera = camera; el._pivot = pivot;
      function resize() {
        var w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      resize();
      this._ro = new ResizeObserver(resize);
      this._ro.observe(this);

      var t0 = performance.now();
      var tick = function () {
        if (!el.isConnected) return;
        el._raf = requestAnimationFrame(tick);
        var t = (performance.now() - t0) / 1000;
        pivot.rotation.y = t * 0.42;
        pivot.rotation.x = Math.sin(t * 0.5) * 0.07;
        pivot.position.y = Math.sin(t * 0.7) * 0.08;
        renderer.render(scene, camera);
      };
      tick();
      this._renderer = renderer;
    }

    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._renderer) this._renderer.dispose();
    }
  }

  if (!customElements.get('garlic-3d')) customElements.define('garlic-3d', Garlic3D);
})();
