import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Halo } from '../components/Halo.tsx';
import { Icon } from '../components/Icon.tsx';
import { IconButton } from '../components/IconButton.tsx';
import type { NavKey } from '../components/nav.ts';
import { ScreenTop } from '../components/ScreenTop.tsx';
import { SideNav } from '../components/SideNav.tsx';
import { TabBar } from '../components/TabBar.tsx';
import './AppLayout.css';

type Props = {
  /** The entry of the navigation this screen belongs to. */
  current: NavKey;
  title: string;
  subtitle?: string;
  /**
   * The address of the screen this one was opened from. A screen opened from
   * a tab (a form, a record) hides the TabBar and shows a way back.
   */
  back?: string;
  /** When going back is not going to another address: the previous step of a flow held by one screen. */
  onBack?: () => void;
  /** The name of that screen, shown beside the way back on a desktop: "Fanfarons". */
  backLabel?: string;
  /** Where the member is in a flow of several steps: a StepIndicator, above the title. */
  step?: ReactNode;
  /** One action of the page, beside its title. */
  action?: ReactNode;
  /** What narrows or sorts the content: filters. Under the title on a phone, beside it on a desktop. */
  toolbar?: ReactNode;
  /** How far the content spreads: a form or a record stops earlier than a grid or a table. */
  width?: 'form' | 'wide';
  children: ReactNode;
  /** The BottomBar of the screen. */
  actions?: ReactNode;
  /** Makes the content and its actions a form: pressing Enter in a field sends it. */
  onSubmit?: () => void;
};

// The frame of every screen of the app, once signed in. Layout only (Figma:
// "plain frames remain only for layout"):
//
//   below 1024   the halo at the top, ScreenTop, the content, and the TabBar
//                floating at the bottom (a screen opened from a tab shows a
//                way back instead)
//   from 1024    the SideNav on the left, a floating glass menu; on the
//                right the title of the page with its actions at its right,
//                then the content
export function AppLayout({
  current,
  title,
  subtitle,
  back,
  onBack,
  backLabel,
  step,
  action,
  toolbar,
  width = 'wide',
  children,
  actions,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const Body = onSubmit ? 'form' : 'div';

  return (
    <div
      className="AppLayout"
      data-width={width}
      data-has-back={back ? 'true' : undefined}
      data-has-toolbar={toolbar ? 'true' : undefined}
    >
      <SideNav current={current} />
      <main className="AppLayout-main">
        <Halo />
        <header className="AppLayout-header">
          <ScreenTop
            leading={
              back && (
                <>
                  <span className="AppLayout-backButton">
                    <IconButton
                      kind="glass"
                      icon="ChevronLeft"
                      label={t('common.back')}
                      onClick={() => (onBack ? onBack() : navigate(back))}
                    />
                  </span>
                  {/* On a desktop the way back is a line of text that names where it leads. */}
                  <Link
                    className="AppLayout-backLink textLabel"
                    to={back}
                    onClick={
                      onBack
                        ? (event) => {
                            event.preventDefault();
                            onBack();
                          }
                        : undefined
                    }
                  >
                    <Icon name="ChevronLeft" size={20} />
                    {backLabel ?? t('common.back')}
                  </Link>
                </>
              )
            }
            action={action}
            band={step}
            title={title}
            subtitle={subtitle}
          />
          {toolbar && <div className="AppLayout-toolbar">{toolbar}</div>}
        </header>
        <Body
          className="AppLayout-body"
          onSubmit={
            onSubmit
              ? (event) => {
                  event.preventDefault();
                  onSubmit();
                }
              : undefined
          }
          noValidate={onSubmit ? true : undefined}
        >
          <div className="AppLayout-content">{children}</div>
          {actions}
        </Body>
      </main>
      {!back && <TabBar current={current} />}
    </div>
  );
}
