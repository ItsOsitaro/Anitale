import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, X } from 'lucide-react';
import { useSiteLang } from '@/i18n';
import { useSheet } from '@/hooks/use-sheet';
import { cn } from 'cn';

const HUES = [8, 342, 276, 208, 168, 96];

// Bottom sheet for the account basics: avatar colour, bio and sign-out.
export default function EditProfileSheet({ open, onClose, user }) {
  const { t } = useSiteLang();
  const ref = useRef(null);
  const me = user.me;
  const [bio, setBio] = useState('');
  const [state, setState] = useState('idle'); // idle | saving | saved
  useSheet(open, onClose, ref);

  useEffect(() => {
    if (open) { setBio(me?.bio || ''); setState('idle'); }
  }, [open, me?.bio]);

  if (!open || !me) return null;

  const pickHue = async (hue) => {
    if (me.bloom === hue) return;
    const previous = me.bloom;
    user.setMe((current) => ({ ...current, bloom: hue }));
    try {
      const { user: updated } = await user.saveAvatar(hue);
      user.setMe((current) => ({ ...current, bloom: updated.bloom }));
    } catch {
      user.setMe((current) => ({ ...current, bloom: previous }));
    }
  };

  const saveBio = async () => {
    setState('saving');
    try {
      const { user: updated } = await user.saveBio(bio);
      user.setMe((current) => ({ ...current, bio: updated.bio }));
      setState('saved');
    } catch {
      setState('idle');
    }
  };

  return createPortal(
    <div className="filter-sheet__scrim" onClick={onClose} role="presentation">
      <div
        ref={ref}
        className="filter-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('dbEditProfile')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="filter-sheet__grab"><div className="more-sheet__handle" aria-hidden="true" /></div>
        <div className="filter-sheet__head">
          <h2 className="filter-sheet__title">{t('dbEditProfile')}</h2>
          <button type="button" className="filter-sheet__close" onClick={onClose} aria-label={t('mcClose')}>
            <X width={20} height={20} aria-hidden="true" />
          </button>
        </div>
        <div className="filter-sheet__body">
          <section className="filter-sheet__group">
            <h3 className="filter-sheet__label">{t('avatarPickerLabel')}</h3>
            <div className="edit-swatches" role="group" aria-label={t('avatarPickerLabel')}>
              {HUES.map((hue) => (
                <button
                  key={hue}
                  type="button"
                  aria-pressed={me.bloom === hue}
                  aria-label={t('avatarColorOption')}
                  className={cn('edit-swatch', me.bloom === hue && 'is-active')}
                  style={{ '--bloom': hue }}
                  onClick={() => pickHue(hue)}
                />
              ))}
            </div>
          </section>
          <section className="filter-sheet__group">
            <label className="filter-sheet__label" htmlFor="edit-bio">{t('dashBio')}</label>
            <textarea
              id="edit-bio"
              className="entry-sheet__note"
              rows={4}
              dir="auto"
              maxLength={300}
              value={bio}
              onChange={(e) => { setBio(e.target.value); setState('idle'); }}
            />
            <p className="edit-hint">{t('dashBioHint')}</p>
          </section>
        </div>
        <div className="filter-sheet__footer">
          <button type="button" className="filter-sheet__clear entry-sheet__remove" onClick={() => { onClose(); user.logout(); }}>
            <LogOut width={17} height={17} aria-hidden="true" />
            <span>{t('dashLogout')}</span>
          </button>
          <button type="button" className="filter-sheet__apply" disabled={state === 'saving'} onClick={saveBio}>
            {state === 'saving' ? t('saving') : state === 'saved' ? t('dashSaved') : t('dashSaveBio')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
