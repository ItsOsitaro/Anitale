// The old Jikan importer called api.jikanSearch/jikanImport, which no longer exist, and nothing renders it.
// It is now an alias of the current importer so a stray import can never crash the admin panel.
export { default } from './TitleImport.jsx';
