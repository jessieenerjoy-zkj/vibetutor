import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';

const TAB_UI = {
  activeBackground: '#fff0f4',
  activeTint: '#ff0a47',
  background: '#faf7f8',
  border: '#efe9ec',
  inactiveTint: '#95a0b4',
  page: '#f3f0f3',
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  let tabBarStyle: any = {
    backgroundColor: TAB_UI.background,
    borderTopColor: TAB_UI.border,
    borderTopWidth: 1,
    height: 82 + (Platform.OS === 'ios' ? insets.bottom : 12),
    paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : 12,
    paddingHorizontal: 16,
    paddingTop: 10,
  };

  if (Platform.OS === 'web') {
    tabBarStyle = {
      ...tabBarStyle,
      height: 'auto',
    };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: TAB_UI.page,
        },
        tabBarStyle,
        tabBarActiveTintColor: TAB_UI.activeTint,
        tabBarInactiveTintColor: TAB_UI.inactiveTint,
        tabBarActiveBackgroundColor: TAB_UI.activeBackground,
        tabBarItemStyle: {
          borderRadius: 18,
          marginHorizontal: 6,
          marginVertical: 8,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'PlusJakartaSans_600SemiBold',
          marginTop: -2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="house" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tutor"
        options={{
          title: 'AI Tutor',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="graduation-cap" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="user" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
