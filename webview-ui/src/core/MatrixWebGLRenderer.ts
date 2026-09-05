import MatrixImageProcessor, { MatrixDataSlice } from "./MatrixImageProcessor";

export interface MatrixWebGLStats {
    renderer: "webgl2";
    uploadMs: number;
    drawMs: number;
}

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
out vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uData;
uniform vec4 uRect;
uniform vec2 uRange;
in vec2 vUv;
out vec4 outColor;

vec3 hue(float h) {
    vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return rgb * rgb * (3.0 - 2.0 * rgb);
}

void main() {
    vec2 uv = mix(uRect.xy, uRect.zw, vUv);
    float value = texture(uData, uv).r;
    float strength = clamp((value - uRange.x) / max(0.000001, uRange.y - uRange.x), 0.0, 1.0);
    vec3 color = hue(strength * 0.5 + 0.6666667);
    outColor = vec4(color, value < uRange.x ? 0.0 : strength);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to create WebGL shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "WebGL shader compilation failed.");
    return shader;
}

export default class MatrixWebGLRenderer {
    private static instances = new WeakMap<HTMLCanvasElement, MatrixWebGLRenderer>();
    static forCanvas(canvas: HTMLCanvasElement) {
        const existing = this.instances.get(canvas);
        if (existing) return existing;
        try {
            const renderer = new MatrixWebGLRenderer();
            this.instances.set(canvas, renderer);
            return renderer;
        } catch {
            return undefined;
        }
    }

    private readonly canvas = document.createElement("canvas");
    private readonly gl: WebGL2RenderingContext;
    private readonly program: WebGLProgram;
    private readonly texture: WebGLTexture;
    private matrix: Float32Array[] | undefined;
    private uploadedFrameRange: [number, number] = [-1, -1];

    private constructor() {
        const gl = this.canvas.getContext("webgl2", { alpha: true, antialias: false, depth: false, preserveDrawingBuffer: true });
        if (!gl) throw new Error("WebGL 2 is unavailable.");
        this.gl = gl;
        const program = gl.createProgram();
        const texture = gl.createTexture();
        const buffer = gl.createBuffer();
        if (!program || !texture || !buffer) throw new Error("Unable to allocate WebGL resources.");
        this.program = program;
        this.texture = texture;
        gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
        gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "WebGL program linking failed.");
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1,
            -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1, 1
        ]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "aPosition");
        const uv = gl.getAttribLocation(program, "aUv");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(uv);
        gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    paint(target: CanvasRenderingContext2D, dataSlice: MatrixDataSlice, width: number, height: number, viewRange: [number, number], verticalZoom: number, verticalOffset: number, valueRange: [number, number]): MatrixWebGLStats | undefined {
        const [, originalBins] = dataSlice.resizedMatrices.sizes[0];
        const drawFromBin = verticalOffset / 2 * originalBins / verticalZoom;
        const drawToBin = (verticalOffset / 2 + 1) * originalBins / verticalZoom;
        const targetSamplesPerPixel = (viewRange[1] - viewRange[0]) / width;
        const targetBinsPerPixel = (drawToBin - drawFromBin) / height;
        const resizeIndex = MatrixImageProcessor.getBestResizes([dataSlice], targetSamplesPerPixel, targetBinsPerPixel)[0];
        const resize = dataSlice.resizedMatrices.resizes[resizeIndex];
        const matrix = resize.data[0];
        const allFrames = matrix.length;
        const bins = matrix[0]?.length ?? 0;
        const matrixStartSample = dataSlice.startIndex - resize.offsetFromFrame;
        const frameStart = Math.max(0, Math.min(allFrames - 1, Math.floor((viewRange[0] - matrixStartSample) / resize.audioSamplesPerFrame)));
        const frameEnd = Math.max(frameStart + 1, Math.min(allFrames, Math.ceil((viewRange[1] - matrixStartSample) / resize.audioSamplesPerFrame)));
        const frames = frameEnd - frameStart;
        const maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
        if (!frames || !bins || frames > maxTextureSize || bins > maxTextureSize) return undefined;
        if (this.canvas.width !== Math.max(1, width)) this.canvas.width = Math.max(1, width);
        if (this.canvas.height !== Math.max(1, height)) this.canvas.height = Math.max(1, height);
        const uploadStart = performance.now();
        if (this.matrix !== matrix || this.uploadedFrameRange[0] !== frameStart || this.uploadedFrameRange[1] !== frameEnd) {
            const textureData = new Float32Array(frames * bins);
            for (let bin = 0; bin < bins; bin++) for (let frame = 0; frame < frames; frame++) textureData[bin * frames + frame] = matrix[frameStart + frame][bin];
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, frames, bins, 0, this.gl.RED, this.gl.FLOAT, textureData);
            this.matrix = matrix;
            this.uploadedFrameRange = [frameStart, frameEnd];
        }
        const uploadMs = performance.now() - uploadStart;
        const drawStart = performance.now();
        const gl = this.gl;
        const textureStartSample = matrixStartSample + frameStart * resize.audioSamplesPerFrame;
        const textureSampleLength = frames * resize.audioSamplesPerFrame;
        const x0 = Math.max(0, Math.min(1, (viewRange[0] - textureStartSample) / textureSampleLength));
        const x1 = Math.max(0, Math.min(1, (viewRange[1] - textureStartSample) / textureSampleLength));
        const y0 = Math.max(0, Math.min(1, verticalOffset / (2 * verticalZoom)));
        const y1 = Math.max(0, Math.min(1, (verticalOffset / 2 + 1) / verticalZoom));
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform4f(gl.getUniformLocation(this.program, "uRect"), x0, y0, x1, y1);
        gl.uniform2f(gl.getUniformLocation(this.program, "uRange"), valueRange[0], valueRange[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        target.clearRect(0, 0, width, height);
        target.drawImage(this.canvas, 0, 0, width, height);
        return { renderer: "webgl2", uploadMs, drawMs: performance.now() - drawStart };
    }
}
