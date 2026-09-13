import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export type GeneratedLesson = { title: string; body: string };
export type GeneratedModule = { title: string; lessons: GeneratedLesson[] };
export type GeneratedOutline = { modules: GeneratedModule[] };

const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    modules: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          lessons: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['title', 'body'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'lessons'],
        additionalProperties: false,
      },
    },
  },
  required: ['modules'],
  additionalProperties: false,
};

// Isolated behind this service (not called directly from the processor) so
// the "call the model, parse the result, validate its shape" concerns stay
// in one place — same reasoning as StorageService wrapping the MinIO client.
@Injectable()
export class OpenAiService {
  // Built lazily, not in the constructor: the OpenAI client throws eagerly
  // if no apiKey is configured, and constructor-time construction would
  // crash the whole app at boot for anyone who hasn't set OPENAI_API_KEY
  // yet — this way only an actual generation attempt fails.
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async generateOutline(title: string, description?: string): Promise<GeneratedOutline> {
    const response = await this.getClient().chat.completions.create({
      model: this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content:
            'You design corporate training course outlines. Given a course title and ' +
            'optional description, produce 3-6 modules, each with 2-5 short lessons. ' +
            "Each lesson's body should be 2-4 paragraphs of clear, practical training " +
            'content a learner can read directly — not a placeholder or summary.',
        },
        {
          role: 'user',
          content: description ? `Title: ${title}\nDescription: ${description}` : `Title: ${title}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'course_outline', strict: true, schema: OUTLINE_SCHEMA },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI returned no outline content');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('OpenAI returned malformed JSON for the course outline');
    }

    const outline = parsed as Partial<GeneratedOutline>;
    if (!Array.isArray(outline.modules) || outline.modules.length === 0) {
      throw new Error('OpenAI returned an outline with no modules');
    }
    for (const module of outline.modules) {
      if (!Array.isArray(module.lessons) || module.lessons.length === 0) {
        throw new Error(`OpenAI returned a module ("${module.title}") with no lessons`);
      }
    }

    return outline as GeneratedOutline;
  }
}
