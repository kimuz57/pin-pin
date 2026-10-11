// space3d.js

// -------------------------------------------------------------
// 1. SETUP RENDERER & SCENE
// -------------------------------------------------------------
const canvas = document.getElementById('webgl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();

// [แก้ไขตำแหน่งกล้อง] ปรับ FOV เป็น 35 เพื่อลดการบิดเบี้ยวขอบจอ และถอยกล้องออกมาที่ 22
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 0, 22);
camera.lookAt(0, 0, 0);

const textureLoader = new THREE.TextureLoader();

// -------------------------------------------------------------
// 2. BACKGROUND: MILKY WAY
// -------------------------------------------------------------
const bgGeo = new THREE.SphereGeometry(900, 64, 64);
const bgTex = textureLoader.load('textures/8k_stars_milky_way.jpg');
const bgMat = new THREE.MeshBasicMaterial({ map: bgTex, side: THREE.BackSide });
const bgMesh = new THREE.Mesh(bgGeo, bgMat);
bgMesh.rotation.y = THREE.MathUtils.degToRad(85);
bgMesh.rotation.x = THREE.MathUtils.degToRad(-15);
scene.add(bgMesh);

// -------------------------------------------------------------
// 3. THE GIANT SUN — Procedural Shader + Corona + Solar Wind
// -------------------------------------------------------------
const SUN_RADIUS = 6.8;
const sunGroup = new THREE.Group();
sunGroup.position.set(-14.5, 9.5, -4.0);
scene.add(sunGroup);

// GLSL: 3D Simplex Noise (Ashima Arts) + FBM ใช้ร่วมกันทุกเชดเดอร์
const NOISE_GLSL = `
  vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x  = x_ * ns.x + ns.yyyy;
    vec4 y  = y_ * ns.x + ns.yyyy;
    vec4 h  = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  float fbm(vec3 p){
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * snoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }
`;

// ---------------------------------------------------------
// 3.1 ผิวดวงอาทิตย์ (Photosphere): พลาสมาไหล + แกรนูล + จุดดับ
//      + Limb darkening + Faculae + ขอบโครโมสเฟียร์
// ---------------------------------------------------------
const sunVertexShader = `
  varying vec2 vUv;
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vObjPos = position;                         // พิกัดวัตถุ → ลายหมุนไปกับดวงอาทิตย์
    vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sunFragmentShader = `
  uniform float uTime;
  uniform sampler2D uSunTex;
  uniform float uTexMix;
  varying vec2 vUv;
  varying vec3 vObjPos;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  ${NOISE_GLSL}

  void main() {
    vec3 p  = normalize(vObjPos);
    vec3 V  = normalize(cameraPosition - vWorldPos);
    float mu = clamp(dot(normalize(vNormalW), V), 0.0, 1.0);

    // ใช้สีจาก texture 100%
    vec3 col = texture2D(uSunTex, vUv).rgb;

    // Limb darkening เบาๆ ให้ดวงดูเป็นทรงกลม (ลบบรรทัดนี้ได้ถ้าต้องการรูปล้วน)
    // col *= 0.55 + 0.45 * pow(mu, 0.4);
    float rim = pow(1.0 - mu, 3.0);
    col += vec3(1.0, 0.75, 0.4) * rim * 0.8;

    gl_FragColor = vec4(col * 1.1, 1.0);
  }
`;

const sunMat = new THREE.ShaderMaterial({
  vertexShader: sunVertexShader,
  fragmentShader: sunFragmentShader,
  uniforms: {
    uTime:   { value: 0 },
    uSunTex: { value: null },
    uTexMix: { value: 0.0 }
  }
});
// ถ้ามีไฟล์ texture จะผสมเข้าไปเล็กน้อย ถ้าไม่มีก็ใช้ลายเชดเดอร์ล้วน
textureLoader.load('textures/8k_sun.jpg', (tex) => {
  sunMat.uniforms.uSunTex.value = tex;
  sunMat.uniforms.uTexMix.value = 1.0;
});

const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 128, 128), sunMat);
sunGroup.add(sunMesh);

// ---------------------------------------------------------
// 3.3 โคโรนา (Corona) — แผ่นหันเข้ากล้อง มีสายลำแสง (Streamers)
//      ไหลออกจากดวงตามเวลา
// ---------------------------------------------------------
const CORONA_EXTENT = 3.2; // ขนาดโคโรนาเป็นจำนวนเท่าของรัศมีดวงอาทิตย์
const coronaMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uExtent;
    uniform float uLimb;
    varying vec2 vUv;
    ${NOISE_GLSL}
    void main() {
      vec2 p = (vUv - 0.5) * 2.0 * uExtent;   // หน่วย = รัศมีดวงอาทิตย์
      float r = length(p);
      if (r < uLimb) discard;                 // ตัดทุกอย่างที่อยู่ในขอบดวง (ไม่วาดทับหน้าดวง)
      vec2 dir = p / r;
      float h = r - uLimb;                    // ความสูงจากขอบดวงที่ตาเห็นจริง

      // Streamers: noise ตามมุม + เลื่อนออกด้านนอกตามเวลา
      float ang  = fbm(vec3(dir * 2.5, h * 0.6  - uTime * 0.08));
      float rays = fbm(vec3(dir * 7.0, h * 0.25 - uTime * 0.12));
      float streamer = smoothstep(-0.1, 0.6, ang) * (0.6 + 0.4 * rays);

      float inner = exp(-h * 3.0) * 0.7;           // ฟุ้งบางๆ ติดผิว (ไม่เป็นวงขาว)
      float mid   = exp(-h * 2.2) * streamer * 0.45; // สายโคโรนา (เบาลง)
      float outer = exp(-h * 0.9) * streamer * 0.12;
      float intensity = inner * 1.1 + mid * 0.9 + outer;
      intensity *= 1.0 - smoothstep(uExtent * 0.7, uExtent, r);

      vec3 col = mix(vec3(1.0, 0.7, 0.35), vec3(1.0, 0.45, 0.1), smoothstep(0.0, 1.2, h));
      col = mix(col, vec3(0.6, 0.25, 0.15), smoothstep(1.2, 3.0, h));

      gl_FragColor = vec4(col, clamp(intensity, 0.0, 1.5));
    }
  `,
  uniforms: {
    uTime:   { value: 0 },
    uExtent: { value: CORONA_EXTENT },
    uLimb:   { value: 1.0 }
  },
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const coronaSize = SUN_RADIUS * CORONA_EXTENT * 2.0;
const coronaMesh = new THREE.Mesh(new THREE.PlaneGeometry(coronaSize, coronaSize), coronaMat);
sunGroup.add(coronaMesh);

// ---------------------------------------------------------
// 3.35 เปลวสุริยะ 3 มิติ (Solar Prominences)
// ---------------------------------------------------------
const PROMINENCE_COUNT = 200;
const prominenceMats = [];

const prominenceVert = `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vNormalW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const prominenceFrag = `
  uniform float uTime;
  uniform float uSeed;
  uniform float uPower;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  ${NOISE_GLSL}
  void main() {
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fres = 1.0 - abs(dot(normalize(vNormalW), V));  // ขอบท่อสว่างกว่า → ดูเป็นก๊าซ

    // พลาสมาไหลไปตามความยาวท่อ
    float n = fbm(vec3(vUv.x * 5.0 - uTime * 0.35, vUv.y * 1.5, uSeed));
    float filament = smoothstep(-0.25, 0.55, n);

    // จางที่โคนทั้งสองข้าง
    float ends = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);

    // กระพริบ/โตขึ้นลงตามเวลา
    float pulse = 0.55 + 0.45 * sin(uTime * 0.4 + uSeed * 6.0);

    float a = filament * ends * (0.6 + 0.4 * fres) * pulse * uPower;
    vec3 col = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.75, 0.35), smoothstep(0.1, 0.7, n));
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function randomUnitVector() {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t));
}

for (let i = 0; i < PROMINENCE_COUNT; i++) {
  const center = randomUnitVector();
  const tangent = new THREE.Vector3().crossVectors(center, randomUnitVector()).normalize();
  const span = 0.025 + Math.random() * 0.06;              
  const footA = center.clone().applyAxisAngle(tangent.clone().cross(center).normalize(), span);
  const footB = center.clone().applyAxisAngle(tangent.clone().cross(center).normalize(), -span);
  const height = SUN_RADIUS * (0.03 + Math.random() * 0.09); 
  const lean = (Math.random() - 0.5) * 0.6;               

  const pts = [];
  const SEG = 40;
  for (let k = 0; k <= SEG; k++) {
    const s = k / SEG;
    const dir = new THREE.Vector3().lerpVectors(footA, footB, s).normalize();
    const lift = Math.sin(Math.PI * s) * height;
    const p = dir.multiplyScalar(SUN_RADIUS * 0.99 + lift);
    p.addScaledVector(tangent, Math.sin(Math.PI * s) * height * lean);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const thickness = SUN_RADIUS * (0.0025 + Math.random() * 0.007);

  const mat = new THREE.ShaderMaterial({
    vertexShader: prominenceVert,
    fragmentShader: prominenceFrag,
    uniforms: {
      uTime:  { value: 0 },
      uSeed:  { value: Math.random() * 100.0 },
      uPower: { value: 0.9 + Math.random() * 0.7 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  prominenceMats.push(mat);

  sunMesh.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, thickness, 6, false), mat));
}

// ---------------------------------------------------------
// 3.4 ลมสุริยะ (Solar Wind)
// ---------------------------------------------------------
const WIND_COUNT = 1107;
const windGeo = new THREE.BufferGeometry();
const wPos  = new Float32Array(WIND_COUNT * 3);  
const wDir  = new Float32Array(WIND_COUNT * 3);
const wSeed = new Float32Array(WIND_COUNT * 3);
for (let i = 0; i < WIND_COUNT; i++) {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  wDir[i * 3]     = s * Math.cos(t);
  wDir[i * 3 + 1] = u;
  wDir[i * 3 + 2] = s * Math.sin(t);
  wSeed[i * 3]     = Math.random();
  wSeed[i * 3 + 1] = Math.random();
  wSeed[i * 3 + 2] = Math.random();
}
windGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
windGeo.setAttribute('aDir',     new THREE.BufferAttribute(wDir, 3));
windGeo.setAttribute('aSeed',    new THREE.BufferAttribute(wSeed, 3));

const windMat = new THREE.ShaderMaterial({
  vertexShader: `
    uniform float uTime;
    uniform float uSunRadius;
    uniform float uMaxDist;
    uniform float uPixelRatio;
    attribute vec3 aDir;
    attribute vec3 aSeed;
    varying float vAlpha;
    varying float vT;
    void main() {
      float speed = 0.015 + aSeed.y * 0.025;
      float t = fract(aSeed.x + uTime * speed);   
      float dist = uSunRadius * 1.02 + t * uMaxDist;

      float ang = t * 1.2 * (0.6 + aSeed.z * 0.8);
      float c = cos(ang), s = sin(ang);
      vec3 d = vec3(c * aDir.x + s * aDir.z, aDir.y, -s * aDir.x + c * aDir.z);

      d += 0.05 * t * vec3(
        sin(uTime * 0.7 + aSeed.x * 40.0),
        cos(uTime * 0.6 + aSeed.y * 30.0),
        sin(uTime * 0.5 + aSeed.z * 20.0));

      vec3 pos = normalize(d) * dist;
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;

      float size = (0.6 + aSeed.z * 1.4) * (1.0 + t * 1.5);
      gl_PointSize = size * uPixelRatio * (80.0 / -mv.z);

      vAlpha = smoothstep(0.0, 0.06, t) * pow(1.0 - t, 1.5);
      vT = t;
    }
  `,
  fragmentShader: `
    varying float vAlpha;
    varying float vT;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      vec3 col = mix(vec3(1.0, 0.85, 0.5), vec3(0.55, 0.75, 1.0), smoothstep(0.2, 0.9, vT));
      gl_FragColor = vec4(col, a * vAlpha * 0.55);
    }
  `,
  uniforms: {
    uTime:       { value: 0 },
    uSunRadius:  { value: SUN_RADIUS },
    uMaxDist:    { value: 32.0 },
    uPixelRatio: { value: renderer.getPixelRatio() }
  },
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const windPoints = new THREE.Points(windGeo, windMat);
windPoints.frustumCulled = false;
sunGroup.add(windPoints);

// -------------------------------------------------------------
// 4. THE EARTH (เต็มดวง วางกลางจอ)
// -------------------------------------------------------------
const earthGroup = new THREE.Group();
earthGroup.position.set(-1.8, -2.4, 0);
scene.add(earthGroup);

const sunLight = new THREE.DirectionalLight(0xfff5e6, 3.8);
sunLight.position.copy(sunGroup.position);
sunLight.target = earthGroup;
scene.add(sunLight);
scene.add(sunLight.target);

const ambientLight = new THREE.AmbientLight(0x060f1c, 0.05);
scene.add(ambientLight);

const earthAxialTilt = new THREE.Group();
earthAxialTilt.rotation.z = THREE.MathUtils.degToRad(23.44);
earthAxialTilt.rotation.x = THREE.MathUtils.degToRad(12.0);
earthGroup.add(earthAxialTilt);

// 4.1 ผิวโลก (Day / Night Blend)
const earthVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const earthFragmentShader = `
  uniform sampler2D uDayMap;
  uniform sampler2D uNightMap;
  uniform vec3 uSunPosition;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunPosition - vWorldPosition);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    float sunDot = dot(N, L);
    float dayFactor = smoothstep(-0.08, 0.18, sunDot);

    // ---- กลางวัน ----
    vec3 day = texture2D(uDayMap, vUv).rgb;
    day = pow(day, vec3(1.08));                       // เพิ่มคอนทราสต์เล็กน้อย
    float luma = dot(day, vec3(0.299, 0.587, 0.114));
    day = mix(vec3(luma), day, 1.15);                 // เพิ่มความสดของสี
    float diffuse = max(sunDot, 0.0);
    vec3 dayColor = day * diffuse * 1.5;

    // แสงสะท้อนบนมหาสมุทร (ตรวจจากพิกเซลที่ฟ้ามากกว่าแดง)
    float ocean = smoothstep(0.03, 0.15, day.b - day.r);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 70.0) * ocean * diffuse;
    dayColor += vec3(1.0, 0.92, 0.8) * spec * 0.7;

    // ---- กลางคืน ----
    vec3 night = texture2D(uNightMap, vUv).rgb;
    float nightLum = dot(night, vec3(0.299, 0.587, 0.114));
    vec3 nightBase = vec3(nightLum) * 0.6;
    nightBase += vec3(dot(day, vec3(0.299, 0.587, 0.114))) * 0.040;
    float lights = smoothstep(0.1, 0.6, max(night.r, night.g));
    vec3 cityLights = vec3(1.0, 0.7, 0.35) * lights * 2.4;
    vec3 nightColor = (nightBase + cityLights) * (1.0 - dayFactor);

    // ---- บรรยากาศบางๆ ที่ขอบผิวโลก ----
    float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    float lit = smoothstep(-0.15, 0.4, sunDot);
    vec3 atmosCol = mix(vec3(1.0, 0.45, 0.15), vec3(0.35, 0.65, 1.0), smoothstep(0.0, 0.35, sunDot));
    vec3 atmos = atmosCol * fres * lit * 1.1;

    gl_FragColor = vec4(dayColor + nightColor + atmos, 1.0);
  }
`;

const earthMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4.0, 64, 64),
  new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: earthFragmentShader,
    uniforms: {
      uDayMap: { value: textureLoader.load('textures/8k_earth_daymap.jpg') },
      uNightMap: { value: textureLoader.load('textures/8k_earth_nightmap.jpg') },
      uSunPosition: { value: sunGroup.position }
    }
  })
);
earthMesh.rotation.y = THREE.MathUtils.degToRad(-45);
earthAxialTilt.add(earthMesh);

// 4.2 ชั้นเมฆ (Cloud Layer)
const cloudFragmentShader = `
  uniform sampler2D uCloudMap;
  uniform vec3 uSunPosition;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 sunDir = normalize(uSunPosition - vWorldPosition);
    float sunDot = dot(vNormal, sunDir);
    float dayFactor = smoothstep(-0.15, 0.25, sunDot);

    vec4 cloudTex = texture2D(uCloudMap, vUv);
    float cloudAlpha = cloudTex.r * 0.9;

    float lightIntensity = max(sunDot, 0.0) * 1.2;
    vec3 cloudColor = vec3(1.0) * lightIntensity;

    float alpha = cloudAlpha * dayFactor * 0.9;
    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

const cloudMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4.02, 64, 64),
  new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: cloudFragmentShader,
    uniforms: {
      uCloudMap: { value: textureLoader.load('textures/8k_earth_clouds.jpg') },
      uSunPosition: { value: sunGroup.position }
    },
    transparent: true,
    blending: THREE.NormalBlending
  })
);
cloudMesh.rotation.y = THREE.MathUtils.degToRad(-45);
earthAxialTilt.add(cloudMesh);

// 4.3 ชั้นบรรยากาศบางๆ รอบโลก
const ATMOS_RADIUS = 4.1;
const atmosEdge = Math.sqrt(1.0 - Math.pow(4.0 / ATMOS_RADIUS, 2)); 
const atmosMesh = new THREE.Mesh(
  new THREE.SphereGeometry(ATMOS_RADIUS, 96, 96),
  new THREE.ShaderMaterial({
    vertexShader: earthVertexShader,
    fragmentShader: `
      uniform vec3 uSunPosition;
      uniform float uEdge;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPosition);
        vec3 L = normalize(uSunPosition - vWorldPosition);
        float d = -dot(N, V);                          
        float glow = pow(smoothstep(0.0, uEdge, d), 2.0);
        float sunDot = dot(N, L);
        float lit = smoothstep(-0.25, 0.45, sunDot);
        vec3 col = mix(vec3(1.0, 0.45, 0.15), vec3(0.3, 0.6, 1.0), smoothstep(-0.05, 0.35, sunDot));
        gl_FragColor = vec4(col, glow * lit * 0.3);
      }
    `,
    uniforms: {
      uSunPosition: { value: sunGroup.position },
      uEdge: { value: atmosEdge }
    },
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
earthGroup.add(atmosMesh);

// -------------------------------------------------------------
// 5. RESPONSIVE LOGIC (การจัดการตำแหน่งเมื่อหน้าจอเปลี่ยนขนาด)
// -------------------------------------------------------------
function updateEarthForMobile() {
  const width = window.innerWidth;
  const aspectRatio = window.innerWidth / window.innerHeight;

  if (width <= 500) {
    // โทรศัพท์มือถือ
    earthGroup.scale.set(0.65, 0.65, 0.65); 
    earthGroup.position.set(0, -2.8, 0);    
    sunGroup.position.set(-9.0, 7.0, -4.0); 
  } else if (width > 500 && width <= 1024) {
    // iPad / Tablet
    earthGroup.scale.set(0.85, 0.85, 0.85); 
    earthGroup.position.set(0, -2.0, 0); 
    sunGroup.position.set(-12.0, 8.5, -4.0);
  } else {
    // หน้าจอคอมพิวเตอร์ ปกติ
    earthGroup.scale.set(1, 1, 1);
    earthGroup.position.set(0, -1.0, 0); 

    // ปรับดวงอาทิตย์ตามสัดส่วนจอ เพื่อให้ดูไม่บิดเบี้ยว
    if (aspectRatio < 1.6) {
         sunGroup.position.set(-13.0, 10.5, -4.0); 
    } else {
         sunGroup.position.set(-15.5, 10.5, -4.0); 
    }
  }
}

// -------------------------------------------------------------
// 6. ANIMATION LOOP
// -------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const time = clock.elapsedTime;

  // อัปเดตเวลาให้เชดเดอร์ดวงอาทิตย์
  sunMat.uniforms.uTime.value = time;
  coronaMat.uniforms.uTime.value = time;
  windMat.uniforms.uTime.value = time;
  prominenceMats.forEach((m) => { m.uniforms.uTime.value = time; });

  // โคโรนาตั้งฉากกับเส้นสายตาจากกล้องไปดวงอาทิตย์
  coronaMesh.lookAt(camera.position);
  const camDist = camera.position.distanceTo(sunGroup.position);
  coronaMat.uniforms.uLimb.value = camDist / Math.sqrt(camDist * camDist - SUN_RADIUS * SUN_RADIUS);

  // หมุนออบเจกต์
  earthMesh.rotation.y += delta * 0.035;
  cloudMesh.rotation.y += delta * 0.045;
  sunMesh.rotation.y += delta * 0.015;
  bgMesh.rotation.y += delta * 0.005;

  renderer.render(scene, camera);
}

// เริ่มต้น
updateEarthForMobile();
animate();

// เมื่อมีการ Resize หน้าต่าง
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  windMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  
  updateEarthForMobile(); // ปรับตำแหน่ง 3D ใหม่เวลารีไซส์
});