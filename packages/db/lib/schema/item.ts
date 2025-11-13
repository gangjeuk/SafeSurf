import { integer, pgTable, text, primaryKey, index, vector } from 'drizzle-orm/pg-core';

export const items = pgTable(
  'items',
  {
    itemID: integer('item_id').primaryKey(),
    itemTypeID: integer('item_type_id').notNull(),

    dateAdded: integer('date_added').notNull().default(Date.now()),
    dateModified: integer('date_modified').notNull().default(Date.now()),
    clientDateModified: integer('client_date_modified').notNull().default(Date.now()),

    /**
     * Key for cache
     */
    key: text('key').notNull(),
    version: integer('version').notNull().default(0),
    synced: integer('synced').notNull().default(0),
  },
  table => [index('items_synced').on(table.synced)],
);

export const item_data_values = pgTable('item_data_values', {
  valueID: integer('value_id').primaryKey(),
  value: text('value').unique(),
});

export const item_data = pgTable(
  'item_data',
  {
    itemID: integer('item_id').references(() => items.itemID, { onDelete: 'cascade' }),
    fieldID: integer('field_id').references(() => fields.fieldID),
    valueID: integer('value_id').references(() => item_data_values.valueID),
  },
  table => [
    primaryKey({ columns: [table.itemID, table.fieldID] }),
    index('item_data_field_id').on(table.fieldID),
    index('item_data_value_id').on(table.valueID),
  ],
);

export const item_notes = pgTable(
  'item_notes',
  {
    itemID: integer('item_id')
      .primaryKey()
      .references(() => items.itemID, { onDelete: 'cascade' }),
    parentItemID: integer('parent_item_id').references(() => items.itemID, { onDelete: 'cascade' }),
    note: text('note'),
    title: text('title'),
  },
  table => [index('item_notes_parent_item_id').on(table.parentItemID)],
);

export const item_attachments = pgTable(
  'item_attachments',
  {
    itemID: integer('item_id')
      .primaryKey()
      .references(() => items.itemID, { onDelete: 'cascade' }),
    parentItemID: integer('parent_item_id').references(() => items.itemID, { onDelete: 'cascade' }),
    linkMode: integer('link_mode'),
    contentType: text('content_type', {
      enum: [
        'text/html',
        'image/',
        'application/vnd.oasis.opendocument.graphics',
        'application/vnd.oasis.opendocument.image',
        'application/pdf',
        'audio/',
        'x-pn-realaudio',
        'application/ogg',
        'application/x-killustrator',
        'video/',
        'application/x-shockwave-flash',
        'text/plain',
        'application/rtf',
        'application/msword',
        'text/xml',
        'application/postscript',
        'application/wordperfect5.1',
        'application/x-latex',
        'application/x-tex',
        'application/x-kword',
        'application/x-kspread',
        'application/x-kchart',
        'application/vnd.oasis.opendocument.chart',
        'application/vnd.oasis.opendocument.database',
        'application/vnd.oasis.opendocument.formula',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/vnd.oasis.opendocument.text',
        'application/powerpoint',
        'application/vnd.oasis.opendocument.presentation',
        'application/x-kpresenter',
        'application/vnd.ms-powerpoint',
        'application/epub+zip',
        'application/epub',
      ],
    }),
    // charsetID: integer('charset_id').references(() => charsets.charsetID, { onDelete: 'set null' }),
    path: text('path'),
    syncState: integer('sync_state').default(0),
    storageModTime: integer('storage_mod_time'),
    storageHash: text('storage_hash'),
    lastProcessedModificationTime: integer('last_processed_modification_time'),
  },
  table => [
    index('item_attachments_parent_item_id').on(table.parentItemID),
    // index('item_attachments_charset_id').on(table.charsetID),
    index('item_attachments_content_type').on(table.contentType),
    index('item_attachments_sync_state').on(table.syncState),
    index('item_attachments_last_processed_modification_time').on(table.lastProcessedModificationTime),
  ],
);

/**
 * Pdf annotation
 */
export const item_annotations = pgTable(
  'item_annotations',
  {
    itemID: integer('item_id')
      .primaryKey()
      .references(() => items.itemID, { onDelete: 'cascade' }),
    parentItemID: integer('parent_item_id')
      .notNull()
      .references(() => item_attachments.itemID),
    type: integer('type').notNull(),
    authorName: text('author_name'),
    text: text('text'),
    comment: text('comment'),
    color: text('color'),
    pageLabel: text('page_label'),
    sortIndex: text('sort_index').notNull(),
    position: text('position').notNull(),
    isExternal: integer('is_external').notNull(),
  },
  table => [index('item_annotations_parent_item_id').on(table.parentItemID)],
);

export const fields = pgTable('fields', {
  fieldID: integer('field_id').primaryKey(),
  fieldName: text('field_name', {
    enum: [
      'url',
      'rights',
      'series',
      'volume',
      'issue',
      'edition',
      'place',
      'publisher',
      'pages',
      'ISBN',
      'publicationTitle',
      'ISSN',
      'date',
      'section',
      'callNumber',
      'archiveLocation',
      'distributor',
      'extra',
      'journalAbbreviation',
      'DOI',
      'accessDate',
      'seriesTitle',
      'seriesText',
      'seriesNumber',
      'institution',
      'reportType',
      'code',
      'session',
      'legislativeBody',
      'history',
      'reporter',
      'court',
      'numberOfVolumes',
      'committee',
      'assignee',
      'patentNumber',
      'priorityNumbers',
      'issueDate',
      'references',
      'legalStatus',
      'codeNumber',
      'artworkMedium',
      'number',
      'artworkSize',
      'libraryCatalog',
      'videoRecordingFormat',
      'interviewMedium',
      'letterType',
      'manuscriptType',
      'mapType',
      'scale',
      'thesisType',
      'websiteType',
      'audioRecordingFormat',
      'label',
      'presentationType',
      'meetingName',
      'studio',
      'runningTime',
      'network',
      'postType',
      'audioFileType',
      'versionNumber',
      'system',
      'company',
      'conferenceName',
      'encyclopediaTitle',
      'dictionaryTitle',
      'language',
      'programmingLanguage',
      'university',
      'abstractNote',
      'websiteTitle',
      'reportNumber',
      'billNumber',
      'codeVolume',
      'codePages',
      'dateDecided',
      'reporterVolume',
      'firstPage',
      'documentNumber',
      'dateEnacted',
      'publicLawNumber',
      'country',
      'applicationNumber',
      'forumTitle',
      'episodeNumber',
      'blogTitle',
      'type',
      'medium',
      'title',
      'caseName',
      'nameOfAct',
      'subject',
      'proceedingsTitle',
      'bookTitle',
      'shortTitle',
      'docketNumber',
      'numPages',
      'programTitle',
      'issuingAuthority',
      'filingDate',
      'genre',
      'archive',
    ],
  }),
});

export const embeddings = pgTable('embeddings', {
  itemID: integer('item_id')
    .primaryKey()
    .references(() => items.itemID, { onDelete: 'cascade' }),
  embedding: vector('embedding', { dimensions: 1536 }),
});
