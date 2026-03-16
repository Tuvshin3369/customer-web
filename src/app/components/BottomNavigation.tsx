import { useState, useEffect } from 'react';
import { Home, Car, ClipboardList, ShoppingCart, User, HardHat } from 'lucide-react';

interface BottomNavigationProps {
  onLoginClick:    () => void;
  onHomeClick?:    () => void;
  onCartClick:     () => void;
  onCarClick:      () => void;
  onJobsClick?:    () => void;   // ← new "Ажил" tab
  onProfileClick?: () => void;
  onOrdersClick?:  () => void;   // ← guest "Захиалга" tab
  isLoggedIn?:     boolean;
  cartCount:       number;
  forceActiveTab?: string;
}

export function BottomNavigation({
  onLoginClick,
  onHomeClick,
  onCartClick,
  onCarClick,
  onJobsClick,
  onProfileClick,
  onOrdersClick,
  isLoggedIn = false,
  cartCount,
  forceActiveTab,
}: BottomNavigationProps) {
  const [activeTab, setActiveTab] = useState('home');
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  const navItems = [
    { id: 'home',    label: 'Нүүр',                          icon: Home          },
    { id: 'jobs',    label: 'Ажил',                          icon: HardHat       },
    { id: 'car',     label: 'Машин',                         icon: Car           },
    { id: 'orders',  label: 'Захиалга',                      icon: ClipboardList },
    { id: 'cart',    label: 'Сагс',                          icon: ShoppingCart  },
    { id: 'profile', label: isLoggedIn ? 'Миний' : 'Нэвтрэх', icon: User        },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < lastScrollY || currentScrollY < 100) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsVisible(false);
      }
      setLastScrollY(currentScrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => { window.removeEventListener('scroll', handleScroll); };
  }, [lastScrollY]);

  // Sync externally forced tab (e.g. navigate-to-home after profile save)
  useEffect(() => {
    if (forceActiveTab) setActiveTab(forceActiveTab);
  }, [forceActiveTab]);

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 transition-transform duration-300 lg:hidden ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="max-w-[1280px] mx-auto flex items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'profile') {
                  if (isLoggedIn) {
                    onProfileClick?.();
                  } else {
                    onLoginClick();
                  }
                  return;
                }
                if (item.id === 'car')    { onCarClick();    return; }
                if (item.id === 'jobs')   { onJobsClick?.(); return; }
                if (item.id === 'cart')   { onCartClick();   return; }
                if (item.id === 'orders') { onOrdersClick?.(); return; }
                if (item.id === 'home')   { onHomeClick?.(); }
                setActiveTab(item.id);
              }}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 flex-1 transition-colors min-w-0"
            >
              <div className="relative">
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {item.id === 'cart' && cartCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-[16px] px-[3px] flex items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-bold leading-none pointer-events-none">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </div>
              <span
                className={`leading-none truncate w-full text-center ${isActive ? 'text-blue-600 font-medium' : 'text-gray-400'}`}
                style={{ fontSize: '11px' }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}