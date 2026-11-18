declare module 'mammoth' {
  export interface MammothInput {
    arrayBuffer: ArrayBuffer;
  }
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  const mammoth: {
    convertToHtml(input: MammothInput): Promise<MammothResult>;
    extractRawText(input: MammothInput): Promise<MammothResult>;
  };
  export default mammoth;
}
