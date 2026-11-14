import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useBackToClose } from '@/lib/useBackToClose';
import { useAppText } from '@/lib/appText';

// A sheet from the bottom of the screen over a dimmed page, for something Sellio has to tell
// the person whatever they were doing: a permission that's off (PermissionHelp), being signed
// out (SignedOutNotice). An icon, a title, the words, one main button and a quieter one.
// Built on Radix's dialog like the app's other dialogs, so it also works over one of them (the
// photo sheet, a product's form): it becomes the top layer instead of being blocked by it.
// The phone's Back, Escape and a tap on the dimmed page close it (onClose).
export default function NoticeSheet({
  open,
  onClose,
  icon,
  title,
  children,
  primary,
  secondary,
  closeButton = false,
  testId,
}) {
  const { t } = useAppText();
  const panel = React.useRef(null);
  useBackToClose(open, onClose);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[200] data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ background: 'rgba(15,23,42,0.45)' }}
        />
        <Dialog.Content
          ref={panel}
          tabIndex={-1}
          // Focus goes to the sheet itself, not its first button (which would show as selected).
          onOpenAutoFocus={(event) => { event.preventDefault(); panel.current?.focus({ preventScroll: true }); }}
          data-testid={testId}
          className="fixed inset-x-0 bottom-0 z-[200] mx-auto w-full max-w-lg bg-white px-[18px] pt-2.5 outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300"
          style={{
            borderRadius: '22px 22px 0 0',
            boxShadow: '0 -8px 30px rgba(15,23,42,0.15)',
            paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          <div aria-hidden="true" className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-slate-200" />
          {closeButton && (
            <Dialog.Close
              aria-label={t('Close')}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          )}
          {icon && (
            <div
              aria-hidden="true"
              className="mb-2.5 flex h-[52px] w-[52px] items-center justify-center rounded-full text-violet-600"
              style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(147,51,234,0.14))' }}
            >
              {icon}
            </div>
          )}
          <Dialog.Title className={`mb-1.5 text-lg font-bold leading-snug text-slate-900 ${closeButton ? 'pr-10' : ''}`}>
            {title}
          </Dialog.Title>
          <Dialog.Description asChild>
            <div className="text-sm leading-relaxed text-slate-600">{children}</div>
          </Dialog.Description>
          {primary && (
            <button
              type="button"
              onClick={primary.onClick}
              data-testid={primary.testId}
              className="mt-3.5 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-white"
              style={{ background: 'var(--color-primary-gradient, linear-gradient(135deg, #3b82f6 0%, #9333ea 100%))' }}
            >
              {primary.label}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              data-testid={secondary.testId}
              className="mt-1.5 flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              {secondary.label}
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
