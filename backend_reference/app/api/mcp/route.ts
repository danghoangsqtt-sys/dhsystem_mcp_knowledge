/* 
  NOTE: This is a backend file reference. 
  In a real Next.js project, place this in app/api/mcp/route.ts 
  This endpoint implements the Model Context Protocol (MCP) via SSE.
*/

import { NextRequest } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// MCP Tool Definition
const TOOLS = [
  {
    name: "query_knowledge",
    description: "Search for specific information within a subject knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "The name of the subject (e.g., 'Math', 'ESP32', 'History')" },
        query: { type: "string", description: "The specific question or search term" }
      },
      required: ["subject", "query"]
    }
  }
];

export async function GET(req: NextRequest) {
  // Simple SSE Setup
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // 1. Handshake / Capabilities
      send("endpoint", { capabilities: { tools: {} } });

      // 2. Send Tools List
      send("tools/list_changed", { tools: TOOLS });
      
      // Keep connection open...
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Handling POST requests (RPC Calls from the AI Client)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { method, params, id } = body;

  if (method === 'tools/call') {
    const { name, arguments: args } = params;

    if (name === 'query_knowledge') {
      try {
        const { subject, query } = args;

        // 1. Find Knowledge Base ID by Subject Name
        const { data: kbData } = await supabase
          .from('knowledge_bases')
          .select('id')
          .ilike('title', `%${subject}%`)
          .single();

        if (!kbData) {
          return Response.json({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: `Subject '${subject}' not found.` }] }
          });
        }

        // 2. Generate Embedding for the Query
        const embeddingResp = await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: query
        });
        // Fixed: Access 'embeddings' array property instead of 'embedding'
        const queryVector = embeddingResp.embeddings?.[0]?.values;

        // 3. Search Vector DB (Supabase RPC)
        const { data: docs, error } = await supabase.rpc('match_documents', {
          query_embedding: queryVector,
          match_threshold: 0.7,
          match_count: 3,
          filter_kb_id: kbData.id
        });

        if (error) throw error;

        // 4. Format Result for MCP
        const context = docs.map((d: any) => d.content).join("\n\n---\n\n");
        
        return Response.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ 
              type: "text", 
              text: context || "No relevant information found in the documents." 
            }]
          }
        });

      } catch (err: any) {
        return Response.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: err.message }
        });
      }
    }
  }

  // Handle other methods (tools/list, etc.)
  if (method === 'tools/list') {
      return Response.json({
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS }
      });
  }

  return Response.json({ error: "Method not found" }, { status: 404 });
}