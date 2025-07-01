import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const STLPointCloudHero = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const frameRef = useRef<number>();

  // STL Parser
  const parseSTL = (buffer: ArrayBuffer) => {
    const view = new DataView(buffer);
    const isASCII = buffer.byteLength < 80 || 
      String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer, 0, 5))) === 'solid';

    if (isASCII) {
      return parseASCIISTL(new TextDecoder().decode(buffer));
    } else {
      return parseBinarySTL(view);
    }
  };

  const parseASCIISTL = (data: string) => {
    const vertices: number[] = [];
    const lines = data.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('vertex')) {
        const coords = line.split(/\s+/).slice(1).map(Number);
        vertices.push(...coords);
      }
    }
    
    return new Float32Array(vertices);
  };

  const parseBinarySTL = (view: DataView) => {
    const triangles = view.getUint32(80, true);
    const vertices: number[] = [];
    
    let offset = 84;
    for (let i = 0; i < triangles; i++) {
      // Skip normal vector (12 bytes)
      offset += 12;
      
      // Read 3 vertices (9 floats)
      for (let j = 0; j < 9; j++) {
        vertices.push(view.getFloat32(offset, true));
        offset += 4;
      }
      
      // Skip attribute byte count
      offset += 2;
    }
    
    return new Float32Array(vertices);
  };

  // Sample points on triangle surfaces
  const samplePointsOnSurface = (vertices: Float32Array, samplesPerTriangle = 15) => {
    const points: number[] = [];
    
    for (let i = 0; i < vertices.length; i += 9) {
      const v1 = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
      const v2 = new THREE.Vector3(vertices[i + 3], vertices[i + 4], vertices[i + 5]);
      const v3 = new THREE.Vector3(vertices[i + 6], vertices[i + 7], vertices[i + 8]);
      
      // Sample random points on triangle
      for (let j = 0; j < samplesPerTriangle; j++) {
        const r1 = Math.random();
        const r2 = Math.random();
        
        // Barycentric coordinates
        const sqrt_r1 = Math.sqrt(r1);
        const u = 1 - sqrt_r1;
        const v = r2 * sqrt_r1;
        const w = 1 - u - v;
        
        const point = new THREE.Vector3()
          .addScaledVector(v1, u)
          .addScaledVector(v2, v)
          .addScaledVector(v3, w);
        
        points.push(point.x, point.y, point.z);
      }
    }
    
    return new Float32Array(points);
  };

  const initScene = () => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0xffffff, 1); // White background
    mountRef.current.appendChild(renderer.domElement);
    
    camera.position.set(0, 0, 5);
    
    sceneRef.current = scene;
    rendererRef.current = renderer;
    
    return { scene, camera, renderer };
  };

  const loadSTL = async () => {
    try {
      const response = await fetch('/hero.stl');
      if (!response.ok) return;
      
      const buffer = await response.arrayBuffer();
      const vertices = parseSTL(buffer);
      
      // Sample points on surface
      const pointCloudData = samplePointsOnSurface(vertices, 12);
      
      // Create point cloud
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pointCloudData, 3));
      
      // Center and scale the geometry
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox!.getCenter(center);
      geometry.translate(-center.x, -center.y, -center.z);
      
      const size = geometry.boundingBox!.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 3 / maxDim;
      geometry.scale(scale, scale, scale);
      
      // Black point material
      const material = new THREE.PointsMaterial({
        color: 0x000000, // Black points
        size: 0.02,
        sizeAttenuation: true
      });
      
      const points = new THREE.Points(geometry, material);
      sceneRef.current?.add(points);
      pointsRef.current = points;
      
    } catch (err) {
      console.error('Error loading STL:', err);
    }
  };

  const animate = (camera: THREE.Camera, renderer: THREE.WebGLRenderer) => {
    const tick = () => {
      if (pointsRef.current) {
        // Slow rotation animation
        pointsRef.current.rotation.x += 0.005;
        pointsRef.current.rotation.y += 0.008;
      }
      
      renderer.render(sceneRef.current!, camera);
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const handleResize = () => {
    if (!rendererRef.current || !sceneRef.current) return;
    
    const camera = sceneRef.current.children.find(child => child instanceof THREE.PerspectiveCamera) as THREE.PerspectiveCamera;
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    
    rendererRef.current.setSize(window.innerWidth, window.innerHeight);
  };

  useEffect(() => {
    const sceneData = initScene();
    if (sceneData) {
      loadSTL();
      animate(sceneData.camera, sceneData.renderer);
      
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        if (frameRef.current) {
          cancelAnimationFrame(frameRef.current);
        }
        if (mountRef.current && rendererRef.current) {
          mountRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current?.dispose();
      };
    }
  }, []);

  return (
    <div className="relative w-full h-screen bg-white">
      {/* 3D Scene Container */}
      <div ref={mountRef} className="absolute inset-0" />
      
      {/* Simple text at bottom center */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <p className="text-black text-lg font-medium">Be back soon</p>
      </div>
    </div>
  );
};

export default STLPointCloudHero;