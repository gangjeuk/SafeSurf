import {
  item_annotations,
  item_attachments,
  item_data,
  item_data_values,
  item_notes,
  items,
  fields,
  embeddings,
} from './schema/item.js';
import { PGlite, IdbFs } from '@electric-sql/pglite';
// import { worker } from '@electric-sql/pglite/worker';
import { lo } from '@electric-sql/pglite/contrib/lo';
import { vector } from '@electric-sql/pglite/vector';
import { drizzle } from 'drizzle-orm/pglite';

// export type * from './types.js';

// worker({
//   async init() {
//     return new PGlite({
//       //   extensions: { vector, lo },
//       // TODO: Change db name use const value
//     });
//   },
// });

const pg = new PGlite({
  extensions: { vector, lo },
  // TODO: Change db name use const value
  fs: new IdbFs('database'),
});

const db = drizzle({
  client: pg,
  schema: { item_annotations, item_attachments, item_data, item_data_values, item_notes, items, fields, embeddings },
});

export { db, pg };
