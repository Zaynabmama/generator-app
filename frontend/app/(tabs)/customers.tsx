import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Card,
  Text,
  FAB,
  Searchbar,
  Chip,
  IconButton,
  Menu,
  Button,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { customersAPI, generatorsAPI } from '@/src/services/api';

export default function CustomersScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [generators, setGenerators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  const areas = ['المسعودية', 'الشرقي', 'الحيصة', 'الغربي'];

  const fetchData = async () => {
    try {
      const params: any = {};
      if (searchQuery) params.search = searchQuery;
      if (selectedArea) params.area = selectedArea;

      const [customersRes, generatorsRes] = await Promise.all([
        customersAPI.getAll(params),
        generatorsAPI.getAll(),
      ]);

      setCustomers(customersRes.data);
      setGenerators(generatorsRes.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
      Alert.alert('خطف', 'حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchQuery, selectedArea]);

  const getGeneratorName = (generatorId: string) => {
    const generator = generators.find((g) => g.id === generatorId);
    return generator?.name || 'غير محدد';
  };

  const handleDelete = async (id: string, name: string) => {
    Alert.alert(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف المشترك "${name}"؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await customersAPI.delete(id);
              fetchData();
              Alert.alert('نجاح', 'تم حذف المشترك بنجاح');
            } catch (error: any) {
              Alert.alert('خطأ', error.response?.data?.detail || 'حدث خطأ أثناء الحذف');
            }
          },
        },
      ]
    );
  };

  const renderCustomer = ({ item }: any) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>{item.name}</Text>
            <Text style={styles.customerPhone}>{item.phone}</Text>
          </View>
          <Menu
            visible={menuVisible === item.id}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <IconButton
                icon="dots-vertical"
                onPress={() => setMenuVisible(item.id)}
              />
            }
          >
            <Menu.Item
              onPress={() => {
                setMenuVisible(null);
                router.push(`/customers/${item.id}`);
              }}
              title="عرض"
            />
            <Menu.Item
              onPress={() => {
                setMenuVisible(null);
                handleDelete(item.id, item.name);
              }}
              title="حذف"
            />
          </Menu>
        </View>

        <View style={styles.detailsRow}>
          <Chip icon="map-marker" style={styles.chip}>
            {item.area}
          </Chip>
          <Chip icon="flash" style={styles.chip}>
            {item.amperage} أمبير
          </Chip>
        </View>

        <Text style={styles.detailText}>
          المولد: {getGeneratorName(item.generator_id)}
        </Text>
        <Text style={styles.detailText}>رقم العداد: {item.meter_number}</Text>

        {item.current_balance > 0 && (
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>الرصيد المتبقي:</Text>
            <Text style={styles.balanceAmount}>
              {item.current_balance.toLocaleString()} دينار
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="البحث بالاسم أو رقم الهاتف"
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <View style={styles.filterContainer}>
        <Chip
          selected={selectedArea === null}
          onPress={() => setSelectedArea(null)}
          style={styles.filterChip}
        >
          الكل
        </Chip>
        {areas.map((area) => (
          <Chip
            key={area}
            selected={selectedArea === area}
            onPress={() => setSelectedArea(area)}
            style={styles.filterChip}
          >
            {area}
          </Chip>
        ))}
      </View>

      <FlatList
        data={customers}
        renderItem={renderCustomer}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={loading}
        onRefresh={fetchData}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>لا توجد بيانات</Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/customers/add')}
        label="إضافة مشترك"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#1E1E1E',
  },
  searchbar: {
    backgroundColor: '#2A2A2A',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#1E1E1E',
  },
  filterChip: {
    marginRight: 0,
  },
  listContent: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#1E1E1E',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  customerPhone: {
    fontSize: 14,
    color: '#999',
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#2A2A2A',
  },
  detailText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#999',
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#4CAF50',
  },
});