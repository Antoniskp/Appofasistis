'use strict';

const https = require('https');
const crypto = require('crypto');
const { parse } = require('node-html-parser');
const { buildGreekLawDocument, normalizeWhitespace } = require('../legal/document');
const { parseGreekLegalCitations } = require('../legal/citations');

const API_URL = 'https://www.hellenicparliament.gr/api.ashx';
const REQUEST_TIMEOUT_MS = 20000;
const MAX_PAGE_SIZE = 100;

function stripHtml(value) {
  if (!value) return '';
  return normalizeWhitespace(parse(String(value)).text);
}

function isoDate(value) {
  if (!value) return null;
  const dotNetDate = String(value).match(/^\/Date\((-?\d+)([+-]\d{4})?\)\/$/);
  if (dotNetDate) {
    const offset = dotNetDate[2] || '+0000';
    const minutes = (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(3, 5))) * (offset[0] === '-' ? -1 : 1);
    const date = new Date(Number(dotNetDate[1]) + minutes * 60000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const directIsoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (directIsoMatch) return `${directIsoMatch[1]}-${directIsoMatch[2]}-${directIsoMatch[3]}`;
  const greekMatch = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (greekMatch) {
    const [, day, month, year] = greekMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function yearFromIsoDate(value) {
  const date = isoDate(value);
  return date ? date.slice(0, 4) : null;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function normalizeDocumentType(type, lawNum) {
  if (lawNum) return 'law';
  if (/διεθν/i.test(type || '')) return 'international_convention_bill';
  if (/πρόταση/i.test(type || '')) return 'law_proposal';
  return 'bill';
}

function parseFekNum(fekNum) {
  if (!fekNum) return {};
  const citations = parseGreekLegalCitations(`ΦΕΚ ${fekNum}`);
  const fek = citations.find((citation) => citation.document_type === 'fek');
  if (!fek) return {};

  return {
    fek_issue: fek.fek_issue,
    fek_number: fek.document_number,
    fek_year: fek.document_year,
    fek_date: fek.fek_date,
    fek_canonical_id: fek.document_canonical_id,
  };
}

function normalizeAttachmentList(items, sourceField) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && item.File)
    .map((item, index) => ({
      source_field: sourceField,
      url: item.File,
      file_type: item.FileType || item.Title || null,
      title: item.Title || null,
      position: index + 1,
    }));
}

function collectAttachments(record) {
  return [
    ...normalizeAttachmentList(record.LawPhotocopy, 'LawPhotocopy'),
    ...normalizeAttachmentList(record.RecommReport, 'RecommReport'),
    ...normalizeAttachmentList(record.ReasonalReport, 'ReasonalReport'),
    ...normalizeAttachmentList(record.VotedLaws, 'VotedLaws'),
    ...normalizeAttachmentList(record.LawVotedPerArticle, 'LawVotedPerArticle'),
    ...normalizeAttachmentList(
      Array.isArray(record.Amendments) ? record.Amendments.map((item) => ({
        File: item.File,
        FileType: item.AmendmentNumber,
        Title: item.Description,
      })) : [],
      'Amendments',
    ),
    record.CommissionReport
      ? {
          source_field: 'CommissionReport',
          url: record.CommissionReport,
          file_type: 'CommissionReport',
          title: null,
          position: 1,
        }
      : null,
    record.ScientificServiceReport
      ? {
          source_field: 'ScientificServiceReport',
          url: record.ScientificServiceReport,
          file_type: 'ScientificServiceReport',
          title: null,
          position: 1,
        }
      : null,
  ].filter(Boolean);
}

function searchableTextFromRecord(record) {
  const parts = [
    record.Title,
    record.Ministry,
    record.Type,
    record.LawPhase,
    record.Remarks,
    record.LawSpecialDetails,
    ...(Array.isArray(record.Amendments)
      ? record.Amendments.flatMap((item) => [
          item.AmendmentNumber,
          item.AmendmentMinistry,
          item.Description,
          item.SpecialDetails,
        ])
      : []),
    ...(Array.isArray(record.CommissionSessions)
      ? record.CommissionSessions.flatMap((session) => [
          session.CommiteeTitle,
          stripHtml(session.SessionTitle),
          ...(Array.isArray(session.DiscussionIssues)
            ? session.DiscussionIssues.map((issue) => issue.Title)
            : []),
        ])
      : []),
  ];

  return normalizeWhitespace(parts.filter(Boolean).map(stripHtml).join('\n'));
}

function mapParliamentLawRecord(record, { knownDocuments = [], includeRaw = false } = {}) {
  if (!record || typeof record !== 'object') {
    throw new Error('mapParliamentLawRecord: "record" must be an object.');
  }

  const lawNumber = record.LawNum ? String(record.LawNum) : null;
  const votedAt = isoDate(record.DateVoted);
  const insertedAt = isoDate(record.DateInserted);
  const fek = parseFekNum(record.FekNum);
  const lawYear = lawNumber ? fek.fek_year || yearFromIsoDate(record.DateVoted) || yearFromIsoDate(record.LawPhaseDate) : null;
  const documentType = normalizeDocumentType(record.Type, lawNumber);
  const fallbackId = `parliament:${stableHash(`${record.Title || ''}|${insertedAt || ''}|${votedAt || ''}`)}`;
  const canonicalId = lawNumber && lawYear ? `law:${lawNumber}:${lawYear}` : fallbackId;
  const attachments = collectAttachments(record);
  const text = searchableTextFromRecord(record);
  const graph = buildGreekLawDocument({
    document: {
      canonical_id: canonicalId,
      external_id: canonicalId,
      source: 'hellenic_parliament_open_data',
      source_record_id: fallbackId,
      source_url: buildLawsApiUrl({ lawNum: lawNumber, title: lawNumber ? undefined : record.Title, pageSize: 1 }),
      document_type: documentType,
      type: documentType,
      title: normalizeWhitespace(record.Title || ''),
      title_official: normalizeWhitespace(record.Title || ''),
      law_number: lawNumber,
      law_year: lawYear,
      ministry: record.Ministry || null,
      commission: record.Commission || null,
      category: record.Type || null,
      status: record.LawPhase || null,
      status_date: isoDate(record.LawPhaseDate),
      date_inserted: insertedAt,
      date_voted: votedAt,
      fek_raw: record.FekNum || null,
      ...fek,
      attachment_count: attachments.length,
    },
    text: text || normalizeWhitespace(record.Title || ''),
    knownDocuments,
  });

  return {
    ...graph,
    attachments,
    source: {
      name: 'hellenic_parliament_open_data',
      url: API_URL,
    },
    ...(includeRaw ? { raw: record } : {}),
  };
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${err.message}`));
        }
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms for ${url}`));
    });
    req.on('error', reject);
  });
}

function buildLawsApiUrl({
  pageNo = 1,
  pageSize = 10,
  lawNum,
  title,
  ministry,
  type,
  dateInserted,
  dateVoted,
} = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('q', 'laws');
  url.searchParams.set('pageNo', String(Math.max(1, parseInt(pageNo, 10) || 1)));
  url.searchParams.set('pageSize', String(Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(pageSize, 10) || 10))));

  if (lawNum) url.searchParams.set('lawnum', String(lawNum));
  if (title) url.searchParams.set('title', String(title));
  if (ministry) url.searchParams.set('ministry', String(ministry));
  if (type) url.searchParams.set('type', String(type));
  if (dateInserted) url.searchParams.set('dateinserted', String(dateInserted));
  if (dateVoted) url.searchParams.set('datevoted', String(dateVoted));

  return url.toString();
}

async function importParliamentLaws(options = {}) {
  const {
    knownDocuments = [],
    includeRaw = false,
    ...query
  } = options;
  const url = buildLawsApiUrl(query);
  const payload = await requestJson(url);
  const records = Array.isArray(payload.Data) ? payload.Data : [];

  const documents = records.map((record) => mapParliamentLawRecord(record, {
    knownDocuments,
    includeRaw,
  }));

  return {
    source_name: 'hellenic_parliament_open_data',
    source_url: url,
    imported_at: new Date().toISOString(),
    page: {
      page_no: payload.PageNo || query.pageNo || 1,
      page_size: payload.PageSize || query.pageSize || records.length,
      total_records: payload.TotalRecords || records.length,
      total_pages: payload.TotalPages || 1,
    },
    documents,
    stats: {
      document_count: documents.length,
      reference_count: documents.reduce((sum, doc) => sum + doc.stats.reference_count, 0),
      attachment_count: documents.reduce((sum, doc) => sum + doc.attachments.length, 0),
    },
  };
}

module.exports = {
  API_URL,
  buildLawsApiUrl,
  importParliamentLaws,
  mapParliamentLawRecord,
  parseFekNum,
};
