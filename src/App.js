/** @jsx jsx */
import React, { useRef } from 'react';
// import logo from './logo.svg';
// import './App.css';
import { Canvas, useFrame, useResource } from 'react-three-fiber';
import { css, jsx, Global } from '@emotion/core';
import emotionReset from 'emotion-reset';
import {GUI} from 'dat-gui';
import * as THREE from 'three';

const globalStyles = css`
  ${emotionReset}
  *, *::after, *::before {
    box-sizing: border-box;
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    font-smoothing: antialiased;
  }
`;

const theme = css`
  width: 100vw;
  height: 100vh;
  background-color: #000000;
`;

const Thing = () => {
  const ref = useRef();

  useFrame(() => {
    //ref.current.rotation.z += 0.01;
  });

  return (
    <>
    <mesh
      ref={ref}
      onClick={e => console.log('click')}
      onPointerOver={e => console.log('hover')}
      onPointerOut={e => console.log('unhover')}
      position={[2, 0, 0]}
      receiveShadow castShadow
    >
      <sphereBufferGeometry attach='geometry' args={[1, 32, 32]} />
      <meshBasicMaterial
        attach='material'
        color='hotpink'
        // opacity={0.5}
        // transparent
      />
    </mesh>
    <mesh receiveShadow castShadow>
      <boxBufferGeometry attach='geometry' args={[1, 1, 1]} />
      <meshStandardMaterial
        attach='material'
        color='hotpink'
      />
    </mesh>
    </>
  );
};

const LambertShader = {
  uniforms: {
    ambientLight: { type: "v3", value: [0.1, 0.1, 0.1]},
    directionalLight: { type: "v3", value: [1, 1, 1]},
    // directionalLightDir: { type: "v3", value: [-1, 1, 1]},
    directionalLightDir: { type: "v3", value: [1, 1, 0]},
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vCameraDir;

    void main() {
      vUv = uv;
      // vNormal = (viewMatrix * vec4(normalMatrix * normal, 0.0)).xyz;
      // vNormal = (viewMatrix * vec4(normal, 1.0)).xyz;
      // vNormal = (viewMatrix * vec4( normalMatrix * normal, 0.0 )).xyz;
      // vNormal = normalize(normalMatrix * normal);
      vNormal = normalMatrix * normal;
      vCameraDir = normalize(vec4(cameraPosition, 1.0) - modelViewMatrix * vec4(position, 1.0)).xyz;
      // gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * modelMatrix * viewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vCameraDir;
    uniform vec3 ambientLight;
    uniform vec3 directionalLight;
    uniform vec3 directionalLightDir;

    void main() {
      gl_FragColor = vec4(normalize(vNormal), 1.0);
      // gl_FragColor = vec4(dot(vNormal, normalize(directionalLightDir)));
      return;
      vec3 color = vec3(vUv, 0);
      vec3 diffuse = saturate(dot(vNormal, directionalLightDir)) * directionalLight;
      float specular = pow(saturate(dot(vNormal, normalize(directionalLightDir + normalize(vCameraDir)))), 50.0);
      gl_FragColor = vec4(color * diffuse + specular + ambientLight, 1);
    }
  `,
}

const UE4_BRDF = {
  uniforms: {
    baseColor: { type: "v3", value: [1, 1, 1] },
    emissiveColor: { type: "v3", value: [0, 0, 0]},
    specular: { type: "f", value: 1.0 },
    metallic: { type: "f", value: 0.0 },
    roughness: { type: "f", value: 0.1},
    ambientLight: { type: "v3", value: [0.1, 0.1, 0.1]},
    directionalLightColor: { type: "v3", value: [1, 1, 1]},
    directionalLightDirection: { type: "v3", value: [-1, 1, 1]},
    directionalLightIntensity: { type: "f", value: 3.1415926535897932 },
    envMap: { type: "t", value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    #include <common>

    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);

      vUv = uv;
      vWorldNormal = normalMatrix * normal;
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    // uniform vec3 ambientLight;
    uniform vec3 directionalLightColor;
    uniform vec3 directionalLightDirection;
    uniform float directionalLightIntensity;
    uniform vec3 baseColor;
    uniform vec3 emissiveColor;
    uniform float specular;
    uniform float metallic;
    uniform float roughness;
    uniform samplerCube envMap;

    #include <common>

    uniform struct FGBuffer {
      vec3 diffuseColor;
      vec3 subsurfaceColor;
      vec3 specularColor;
      vec3 emissiveColor;
      float roughness;
      float AO;
    };

    uniform struct FLighting {
      vec3 diffuse;
      vec3 specular;
      float transmission;
    };

    uniform struct BxDFContext {
      float NoV;
      float NoL;
      float VoL;
      float NoH;
      float VoH;
    };

    float rcp(float src) {
      return 1.0 / src;
    }

    float pow5(float src) {
      return pow4(src) * src;
    }

    void BxDFContext_Init(inout BxDFContext Context, vec3 N, vec3 V, vec3 L) {
      Context.NoL = dot(N, L);
      Context.NoV = dot(N, V);
      Context.VoL = dot(V, L);
      float InvLenH = inversesqrt(2.0 + 2.0 * Context.VoL);
      Context.NoH = saturate((Context.NoL + Context.NoV) * InvLenH);
      Context.VoH = saturate(InvLenH + InvLenH * Context.VoL);
    }

    vec3 Diffuse_Lambert(vec3 diffuseColor) {
      return diffuseColor * (1.0 / PI);
    }

    float D_GGX(float a2, float NoH) {
      float d = (NoH * a2 - NoH) * NoH + 1.0;
      return a2 / ( PI * d * d );
    }

    float Vis_SmithJointApprox(float a2, float NoV, float NoL) {
      float a = sqrt(a2);
      float Vis_SmithV = NoL * (NoV * (1.0 - a) + a);
      float Vis_SmithL = NoV * (NoL * (1.0 - a) + a);
      return 0.5 * rcp(Vis_SmithV + Vis_SmithL);
    }

    vec3 F_Schlick(vec3 specularColor, float VoH) {
      float Fc = pow5(1.0 - VoH);
      return saturate(50.0 * specularColor.g) * Fc + (1.0 - Fc) * specularColor;
    }

    vec3 specularGGX(float roughness, vec3 specularColor, BxDFContext Context, float NoL) {
      float a2 = pow4(roughness);
      // float energy = energyNormalization(a2, Context.VoH, 
      float energy = 1.0;

      // microfacet specular
      float D = D_GGX(a2, Context.NoH) * energy;
      float Vis = Vis_SmithJointApprox(a2, Context.NoV, NoL);
      vec3 F = F_Schlick(specularColor, Context.VoH);
      return (D * Vis) * F;
    }

    vec3 computeF0(float specular, vec3 baseColor, float metallic) {
      return mix(vec3(0.08 * specular), baseColor, metallic);
    }

    FLighting defaultLitBxDF(FGBuffer GBuffer, vec3 N, vec3 V, vec3 L, float NoL) {
      BxDFContext Context;
      BxDFContext_Init(Context, N, V, L);
      Context.NoV = saturate(abs(Context.NoV) + 1e-5);

      vec3 falloffColor = vec3(1.0);
      float falloff = 1.0;

      FLighting Lighting;
      Lighting.diffuse = falloffColor * (falloff * NoL) * Diffuse_Lambert(GBuffer.diffuseColor);
      Lighting.specular = falloffColor * (falloff * NoL) * specularGGX(GBuffer.roughness, GBuffer.specularColor, Context, NoL);
      Lighting.transmission = 0.0;
      return Lighting;
    }

    vec3 getForwardDirectionalLight(FGBuffer GBuffer) {
      vec3 cameraDir = -normalize(vWorldPosition - cameraPosition);
      vec3 V = cameraDir;
      vec3 N = vWorldNormal;
      vec3 L = normalize(directionalLightDirection);
      float NoL = saturate(dot(N, L));
      FLighting Lighting = defaultLitBxDF(GBuffer, N, V, L, NoL);

      vec3 lightColor = directionalLightColor * directionalLightIntensity;
      vec3 totalLight = vec3(0.0);
      totalLight += (Lighting.diffuse + Lighting.specular) * lightColor;
      totalLight += (Lighting.transmission) * lightColor;
      return totalLight;
    }

    vec3 envBRDFApprox(vec3 specularColor, float roughness, float NoV) {
      const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
      const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
      vec4 r = roughness * c0 + c1;
      float a004 = min(r.x * r.x, exp2(-0.28 * NoV)) * r.x + r.y;
      vec2 AB = vec2(-1.04, 1.04) * a004 + r.zw;
      AB.y *= saturate(50.0 * specularColor.g);
      return specularColor * AB.x + AB.y;
    }

    vec3 getEnvColor(float roughness, vec3 specularColor, float indirectIrradiance) {
      vec3 N = vWorldNormal;
      vec3 V = -normalize(vWorldPosition - cameraPosition);

      vec3 rayDirection = 2.0 * dot(V, N) * N - V;
      float NoV = saturate(dot(N, V));

      vec4 imageBasedReflections = vec4(0, 0, 0, 1);
      vec2 compositedAverageBrightness = vec2(0, 1);
      vec4 sampledColor = textureCube(envMap, rayDirection);
      imageBasedReflections = vec4(sampledColor.rgb, 1.0 - sampledColor.a);
      imageBasedReflections.rgb *= mix(1.0, indirectIrradiance, roughness);
      imageBasedReflections.rgb += imageBasedReflections.a * 0.0;
      vec3 specularIBL = imageBasedReflections.rgb;

      vec3 specularBounce = 0.45 * specularColor * indirectIrradiance;
      specularIBL.rgb = mix(specularIBL.rgb, specularBounce, 0.0);
      specularColor = envBRDFApprox(specularColor, roughness, NoV);
      return specularIBL.rgb * specularColor;
    }

    vec3 AOMultiBounce(vec3 color, float AO) {
      vec3 a = 2.0404 * color - 0.3324;
      vec3 b = -4.7951 * color + 0.6417;
      vec3 c = 2.7552 * color + 0.6903;
      return max(vec3(AO), ((AO * a + b) * AO + c) * AO);
    }

    void main() {
      FGBuffer GBuffer;
      GBuffer.diffuseColor = baseColor - baseColor * metallic;
      GBuffer.subsurfaceColor = vec3(0.0);
      GBuffer.specularColor = computeF0(specular, baseColor, metallic);
      GBuffer.emissiveColor = emissiveColor;
      GBuffer.roughness = roughness;

      float materialAO = 1.0;
      // GBuffer.AO = AOMultiBounce(Luminance(GBuffer.specularColor), materialAO).g;

      vec3 diffuseDir = vWorldNormal;
      vec3 diffuseColorForIndirect = GBuffer.diffuseColor;
      vec3 diffuseIndirectLighting = vec3(0.0);
      float indirectIrradiance = 0.0;
      float indirectOcclusion = 1.0;
      diffuseIndirectLighting *= indirectOcclusion;
      indirectIrradiance *= indirectOcclusion;

      vec3 diffuseColor = (diffuseIndirectLighting * diffuseColorForIndirect) * AOMultiBounce(baseColor, materialAO);
      vec3 emissive = GBuffer.emissiveColor;
      vec3 lightColor = getForwardDirectionalLight(GBuffer);
      vec3 envColor = getEnvColor(GBuffer.roughness, GBuffer.specularColor, indirectIrradiance) * indirectOcclusion * AOMultiBounce(GBuffer.specularColor, materialAO);
      vec4 fogging = vec4(0, 0, 0, 1);

      // gl_FragColor = vec4(envColor, 1.0);
      // return;

      vec3 color = vec3(0.0);
      color += lightColor;
      color += envColor;
      color += diffuseColor;
      color += emissive;
      color = color * fogging.a + fogging.rgb;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

function Inner({uniforms}) {
  const normalizeColor = (color) => {
    return [color[0] / 255.0, color[1] / 255.0, color[2] / 255.0]
  }

  // const [materialRef, material] = useResource();
  // const [sphereMeshRef, sphereMesh] = useResource();

  const envMapTexture = (() => {
    const baseUrl = '/textures/bridge/'
    const urls = [ baseUrl + 'posx.jpg', baseUrl + 'negx.jpg',
                   baseUrl + 'posy.jpg', baseUrl + 'negy.jpg',
                   baseUrl + 'posz.jpg', baseUrl + 'negz.jpg']
    let tex = new THREE.CubeTextureLoader().load(urls)
    tex.format = THREE.RGBFormat
    tex.mapping = THREE.CubeReflectionMapping
    tex.encoding = THREE.sRGBEncoding
    return tex
  })()

  const getUniforms = (uniforms) => {
    return Object.assign({}, UE4_BRDF.uniforms, uniforms)
  }

  const getMetalUniforms = (inUniforms) => {
    return Object.assign(getUniforms(inUniforms), {
      metallic: {type: 'f', value: 1.0},
      roughness: {type: 'f', value: 0.65},
      envMap: {type: 't', value: envMapTexture},
    })
  }

  const metallicMaterials = []

  useFrame(state => {
    // const ub = materialRef.current && materialRef.current.uniforms
    // if (ub) {
      // ub.baseColor.value = normalizeColor(uniforms.baseColor);
      // ub.emissiveColor.value = normalizeColor(uniforms.emissiveColor);
      // ub.metallic.value = uniforms.metallic;
      // ub.specular.value = uniforms.specular;
      // ub.roughness.value = uniforms.roughness;
      // ub.directionalLightColor.value = normalizeColor(uniforms.directionalLightColor);
      // ub.directionalLightIntensity.value = uniforms.directionalLightIntensity;
    // }
    for (const mat of metallicMaterials) {
      mat.uniforms.roughness.value = uniforms.metallic.roughness
    }
  })

  const sphereMesh = new THREE.SphereBufferGeometry(1, 64, 64);

  const materialUniforms = {
    Iron: {
      baseColor: {type: 'v3', value: [0.560, 0.570, 0.580]},
    },
    Silver: {
      baseColor: {type: 'v3', value: [0.972, 0.960, 0.915]},
    },
    Aluminum: {
      baseColor: {type: 'v3', value: [0.913, 0.921, 0.925]},
    },
    Gold: {
      baseColor: {type: 'v3', value: [1.000, 0.766, 0.336]},
    },
    Copper: {
      baseColor: {type: 'v3', value: [0.955, 0.637, 0.538]},
    },
    Chromium: {
      baseColor: {type: 'v3', value: [0.550, 0.556, 0.554]},
    },
    Nickel: {
      baseColor: {type: 'v3', value: [0.660, 0.609, 0.526]},
    },
    Titanium: {
      baseColor: {type: 'v3', value: [0.542, 0.497, 0.449]},
    },
    Cobalt: {
      baseColor: {type: 'v3', value: [0.662, 0.655, 0.634]},
    },
    Platinum: {
      baseColor: {type: 'v3', value: [0.672, 0.637, 0.585]},
    },
  }
        // <mesh receiveShadow castShadow position={[-2.5, 0, 0]} geometry={sphereMesh}>
          // <shaderMaterial attach='material' args={[UE4_BRDF]} uniforms={getMetalUniforms(materialUniforms.Gold)} />
        // </mesh>
        // <mesh receiveShadow castShadow position={[0, 0, 0]} material={material} geometry={sphereMesh} />
        // <mesh receiveShadow castShadow position={[2.5, 0, 0]} material={material} geometry={sphereMesh} />
  const meshes = []
  const space = 2.1;
  const keys = Object.keys(materialUniforms)
  const keyLength = keys.length

  // if (sphereMesh) {
    for (let i = 0; i < keyLength; i++) {
      const uniforms = getMetalUniforms(materialUniforms[keys[i]])
      const x = space * i - space * (keyLength - 1) * 0.5
      const material = new THREE.ShaderMaterial( {
        vertexShader: UE4_BRDF.vertexShader,
        fragmentShader: UE4_BRDF.fragmentShader,
        uniforms: uniforms,
      })
      metallicMaterials.push(material)
      meshes.push(
        <mesh receiveShadow castShadow position={[x, 0, 0]} geometry={sphereMesh} material={material} />
          // <shaderMaterial attach='material' args={[UE4_BRDF]} uniforms={uniforms} />
        // </mesh>
      )
    }
  // }

  const cubeShader = THREE.ShaderLib['cube']
        // <mesh receiveShadow castShadow position={[0, -1, 0]} material={material}>
          // <boxBufferGeometry attach='geometry' args={[2000, 0.1, 2000]} />
        // </mesh>
      // <shaderMaterial ref={materialRef} args={[UE4_BRDF]} />
      // <sphereBufferGeometry ref={sphereMeshRef} args={[1, 64, 64]} />
      // <mesh receiveShadow castShadow position={[0, 2.2, 0]} geometry={sphereMesh}>
        // <shaderMaterial attach='material' args={[UE4_BRDF]}  />
      // </mesh>
  return (<>
      {meshes && (<> {meshes} </>)}
      <mesh>
        <sphereBufferGeometry attach='geometry' args={[400, 128, 128]} />
        <shaderMaterial attach='material' args={[cubeShader]} envMap={envMapTexture} side={THREE.BackSide}/>
      </mesh>
    </>);
}


class App extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      shaderModel: 'UE4_BRDF',
    }

    const gui = new GUI();

    this.uniforms = {
      baseColor: [255, 255, 255],
      emissiveColor: [0, 0, 0],
      specular: 0.0,
      metallic: 0.0,
      roughness: 1.0,
      directionalLightColor: [255, 255, 255],
      directionalLightIntensity: Math.PI,
      metallic: {
        roughness: 0.6,
      },
    }

    {
      const folder = gui.addFolder('Shading Model');
      folder.add(this.state, 'shaderModel', ['UE4_BRDF', 'LambertShader']).name('Shader Model').onChange(value => {
      })
    }
    {
      const folder = gui.addFolder('Metallic Parameter')
      folder.add(this.uniforms.metallic, 'roughness', 0.0, 1.0).name('Roughness')
    }
    {
      // const folder = gui.addFolder('Parameter');
      // folder.addColor(this.uniforms, 'baseColor').name('Base Color');
      // folder.addColor(this.uniforms, 'emissiveColor').name('Emissive Color');
      // folder.add(this.uniforms, 'specular', 0.0, 1.0).name('Specular');
      // folder.add(this.uniforms, 'metallic', 0.0, 1.0).name('Metallic');
      // folder.add(this.uniforms, 'roughness', 0.0, 1.0).name('Roughness');
      // folder.addColor(this.uniforms, 'directionalLightColor').name('Light Color');
      // folder.add(this.uniforms, 'directionalLightIntensity', 0.0, 50.0).name('Light Intensity');
    }
  }

  async componentDidMount() {
  }

          // <Thing />
          // <ambientLight intensity={1.0} color='rgb(1, 1, 1)' />
          // <directionalLight castShadow position={[0, 1, 0]} />
  render() {
    return (
      <div css={theme}>
        <Global styles={globalStyles} />
        <Canvas camera={{position: [0, 1, 13]}}>
          <Inner uniforms={this.uniforms}/>
        </Canvas>
      </div>
    );
  }
}

export default App;
