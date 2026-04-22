import { useEffect, useMemo } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface ConfettiCelebrationProps {
  visible: boolean;
  title: string;
  description: string;
  ctaLabel?: string;
  onClose: () => void;
  onCta?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARTICLE_COLORS = ['#F59E0B', '#10B981', '#0EA5E9', '#EC4899', '#8B5CF6', '#F97316'];

export function ConfettiCelebration({
  visible,
  title,
  description,
  ctaLabel,
  onClose,
  onCta,
}: ConfettiCelebrationProps) {
  const overlayOpacity = useMemo(() => new Animated.Value(0), []);
  const cardScale = useMemo(() => new Animated.Value(0.92), []);
  const particleValues = useMemo(
    () => Array.from({ length: 18 }, () => new Animated.Value(-80)),
    []
  );
  const particleRotations = useMemo(
    () => Array.from({ length: 18 }, () => new Animated.Value(0)),
    []
  );

  const particleConfigs = useMemo(
    () =>
      Array.from({ length: 18 }, (_, index) => ({
        left: 16 + (index % 6) * ((SCREEN_WIDTH - 32) / 6),
        delay: index * 70,
        color: PARTICLE_COLORS[index % PARTICLE_COLORS.length],
        size: 10 + (index % 3) * 3,
      })),
    []
  );

  useEffect(() => {
    if (!visible) {
      overlayOpacity.setValue(0);
      cardScale.setValue(0.92);
      particleValues.forEach((value) => value.setValue(-80));
      particleRotations.forEach((value) => value.setValue(0));
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      ...particleValues.map((value, index) =>
        Animated.timing(value, {
          toValue: SCREEN_HEIGHT + 120,
          duration: 1700,
          delay: particleConfigs[index]?.delay || 0,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      ),
      ...particleRotations.map((value, index) =>
        Animated.timing(value, {
          toValue: 1,
          duration: 1700,
          delay: particleConfigs[index]?.delay || 0,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
    ]).start();
  }, [cardScale, overlayOpacity, particleConfigs, particleRotations, particleValues, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute inset-0 items-center justify-center"
      style={{ opacity: overlayOpacity }}
    >
      <Pressable className="absolute inset-0 bg-black/45" onPress={onClose} />

      {particleConfigs.map((config, index) => {
        const rotate = particleRotations[index]?.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '300deg'],
        });

        return (
          <Animated.View
            key={`particle-${index}`}
            style={{
              position: 'absolute',
              top: -40,
              left: config.left,
              width: config.size,
              height: config.size * 1.6,
              borderRadius: 999,
              backgroundColor: config.color,
              transform: [
                { translateY: particleValues[index] || 0 },
                { rotate: rotate || '0deg' },
              ],
            }}
          />
        );
      })}

      <Animated.View
        className="mx-6 w-[88%] rounded-[32px] bg-white px-6 py-7"
        style={{
          transform: [{ scale: cardScale }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 12,
        }}
      >
        <View className="mb-4 self-center rounded-full bg-[#FEF3C7] px-4 py-2">
          <Text className="text-xs font-semibold uppercase tracking-[1px] text-[#B45309]">
            Mind Garden
          </Text>
        </View>
        <Text className="text-center text-2xl font-bold text-[#111827]">{title}</Text>
        <Text className="mt-3 text-center text-sm leading-6 text-[#4B5563]">{description}</Text>
        <View className="mt-6 gap-3">
          {ctaLabel && onCta ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onCta}
              className="items-center rounded-2xl bg-[#111827] px-4 py-3.5"
            >
              <Text className="text-sm font-semibold text-white">{ctaLabel}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onClose}
            className="items-center rounded-2xl bg-[#F3F4F6] px-4 py-3.5"
          >
            <Text className="text-sm font-semibold text-[#111827]">Keep learning</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
