import { z } from 'zod';

export const ObjectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid 24-character hexadecimal ObjectId');

export type ObjectIdString = z.infer<typeof ObjectIdSchema>;
